"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "@/components/billing/UpgradeSheet.module.css";
import type { Lang } from "@/lib/i18n";
import { LABELS } from "@/lib/labels";
import {
  FIRST_TOPUP_BONUS_MIN_PAISE,
  PLAN_LABEL,
  PLAN_PRICE_PAISE,
  TOPUP_PRESETS_PAISE,
  formatRupees,
  type PaidPlan,
} from "@/lib/pricing";
import { INCLUDED_PER_DAY } from "@/lib/usage-rules";

interface Snapshot {
  plan: "free" | PaidPlan;
  walletPaise: number;
  chat: { used: number; included: number; pricePaise: number };
  live: { used: number; included: number; pricePaise: number };
}

// Server के error जवाब का रूप
interface ApiError {
  ok?: boolean;
  code?: string;
  message?: string;
}

// Razorpay checkout: या तो order (wallet top-up) या subscription (मासिक प्लान)
interface RazorpayOptions {
  key: string;
  name: string;
  order_id?: string;
  subscription_id?: string;
  amount?: number;
  currency?: string;
  description?: string;
  handler: () => void;
  modal?: { ondismiss?: () => void };
}
interface RazorpayWindow extends Window {
  Razorpay?: new (options: RazorpayOptions) => { open(): void };
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const PAID_PLANS: PaidPlan[] = ["starter", "premium", "business"];

// हर server code का हिंदी संदेश (topup और subscribe दोनों के codes)।
// server message भेजे तो वही दिखता है; ये सिर्फ़ fallback है।
const CODE_HI: Record<string, string> = {
  UNAUTHORIZED: "भुगतान के लिए पहले लॉग-इन करें।",
  BAD_REQUEST: "प्लान सही नहीं चुना गया।",
  BAD_AMOUNT: "यह रकम मान्य नहीं है।",
  PLAN_NOT_CONFIGURED: "यह प्लान अभी चालू नहीं हुआ है। थोड़ी देर बाद दोबारा कोशिश करें।",
  ALREADY_ACTIVE: "आपका प्लान पहले से चालू है।",
  RAZORPAY_REJECTED: "Razorpay ने यह प्लान नहीं बनाया। थोड़ी देर बाद दोबारा कोशिश करें।",
  ORDER_FAILED: "Razorpay पर भुगतान शुरू नहीं हो पाया। थोड़ी देर बाद दोबारा कोशिश करें।",
  INTERNAL: "कुछ गड़बड़ हुई, दोबारा कोशिश करें।",
};

function loadCheckout(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as RazorpayWindow).Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// "बढ़ाएँ" शीट: आज का इस्तेमाल, वॉलेट भरना (पे-पर-यूज़) और मासिक प्लान। सीमा पूरी होने पर भी यही खुलती है।
export function UpgradeSheet({
  open,
  onClose,
  lang,
  limitReached = false,
}: {
  open: boolean;
  onClose: () => void;
  lang: Lang;
  limitReached?: boolean;
}) {
  const t = LABELS[lang].up;
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "login" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  // कौन सा बटन चल रहा है (जैसे "topup-50" या "plan-starter")। सिर्फ़ वही बटन बदलता है।
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  // दोबारा दबाने से दो checkout न खुलें
  const busyRef = useRef(false);

  async function load() {
    setState("loading");
    try {
      const res = await fetch("/api/usage", { cache: "no-store" });
      if (res.status === 401) return setState("login");
      if (!res.ok) return setState("error");
      setSnap((await res.json()) as Snapshot);
      setState("ok");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    if (!open) return;
    setMessage(null);
    void load();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // एक समय में एक ही भुगतान शुरू हो सकता है
  function begin(key: string): boolean {
    if (busyRef.current) return false;
    busyRef.current = true;
    setPendingKey(key);
    setMessage(t.opening);
    return true;
  }

  function end() {
    busyRef.current = false;
    setPendingKey(null);
  }

  // Server का जवाब पढ़ें: पहले message, फिर code का हिंदी, फिर सामान्य संदेश।
  // साथ में code भी दिखाते हैं, ताकि सहायता के लिए बताया जा सके।
  async function readApiError(res: Response): Promise<string> {
    const data = (await res.json().catch(() => null)) as ApiError | null;
    const text = data?.message ?? (data?.code ? CODE_HI[data.code] : undefined) ?? t.payFail;
    return data?.code ? `${text} (कोड: ${data.code})` : text;
  }

  // Razorpay checkout खोलें और handler/ondismiss जोड़ें
  function openRazorpay(options: Omit<RazorpayOptions, "handler" | "modal">): void {
    const Razorpay = (window as RazorpayWindow).Razorpay;
    if (!Razorpay) throw new Error("no razorpay");
    new Razorpay({
      ...options,
      handler: () => {
        setMessage(t.paid);
        // पैसा और प्लान webhook से आते हैं, इसलिए थोड़ी देर बाद ताज़ा करें
        setTimeout(() => void load(), 3500);
      },
      modal: { ondismiss: () => setMessage(null) },
    }).open();
  }

  // वॉलेट में पैसे डालना: order बनता है, फिर checkout
  async function topup(amountPaise: number) {
    const key = `topup-${amountPaise}`;
    if (!begin(key)) return;
    try {
      const res = await fetch("/api/billing/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountPaise }),
      });
      if (!res.ok) {
        setMessage(await readApiError(res));
        return;
      }
      const data = (await res.json()) as { ok?: boolean; orderId?: string; amountPaise?: number; keyId?: string };
      if (!data.ok || !data.orderId || !data.keyId) {
        setMessage(t.payFail);
        return;
      }
      if (!(await loadCheckout())) {
        setMessage("Razorpay की स्क्रिप्ट नहीं खुली। इंटरनेट जांचें और दोबारा कोशिश करें।");
        return;
      }
      openRazorpay({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amountPaise ?? amountPaise,
        currency: "INR",
        name: "Sthamly",
        description: "वॉलेट में पैसे",
      });
    } catch {
      setMessage("नेटवर्क की गड़बड़ी। दोबारा कोशिश करें।");
    } finally {
      end();
    }
  }

  // मासिक प्लान: subscription बनता है, फिर Razorpay checkout उसी subscription के साथ खुलता है
  async function subscribe(plan: PaidPlan) {
    const key = `plan-${plan}`;
    if (!begin(key)) return;
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, cycle: "monthly" }),
      });
      if (!res.ok) {
        setMessage(await readApiError(res));
        return;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        subscriptionId?: string;
        keyId?: string;
        checkoutUrl?: string | null;
        message?: string;
        code?: string;
      };
      if (!data.ok || !data.subscriptionId || !data.keyId) {
        setMessage(data.message ?? (data.code ? CODE_HI[data.code] : undefined) ?? t.payFail);
        return;
      }
      if (await loadCheckout()) {
        openRazorpay({
          key: data.keyId,
          subscription_id: data.subscriptionId,
          name: "Sthamly",
          description: `${PLAN_LABEL[plan]} प्लान (मासिक)`,
        });
      } else if (data.checkoutUrl) {
        // स्क्रिप्ट न खुले तो Razorpay के अपने पन्ने पर भेजें
        window.location.href = data.checkoutUrl;
      } else {
        setMessage("Razorpay की स्क्रिप्ट नहीं खुली। इंटरनेट जांचें और दोबारा कोशिश करें।");
      }
    } catch {
      setMessage("नेटवर्क की गड़बड़ी। दोबारा कोशिश करें।");
    } finally {
      end();
    }
  }

  if (!open) return null;

  const meter = (label: string, used: number, included: number) => {
    const pct = Math.min(100, Math.round((used / Math.max(1, included)) * 100));
    return (
      <div className={styles.meter}>
        <div className={styles.meterTop}>
          <span>{label}</span>
          <span>
            {Math.min(used, included)} {t.of} {included}
          </span>
        </div>
        <div className={styles.bar}>
          <div className={styles.fill} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  // document.body में बनाते हैं, ताकि ऊपर का ☰ बटन या कोई और परत इसके ऊपर न दिखे
  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={t.title} onClick={(e) => e.stopPropagation()}>
        <div className={styles.grab} aria-hidden />
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>{limitReached ? t.limitTitle : t.title}</h2>
            <p className={styles.sub}>{limitReached ? t.limitBody : t.sub}</p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t.close}>
            ✕
          </button>
        </div>

        {state === "loading" && <p className={styles.note}>{t.loading}</p>}
        {state === "login" && <p className={styles.note}>{t.needLogin}</p>}
        {state === "error" && <p className={styles.note}>{t.loadFail}</p>}

        {state === "ok" && snap && (
          <>
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <strong>{t.usage}</strong>
                <span className={styles.walletChip}>
                  {t.wallet}: {formatRupees(snap.walletPaise)}
                </span>
              </div>
              {meter(t.chat, snap.chat.used, snap.chat.included)}
              {meter(t.live, snap.live.used, snap.live.included)}
              <p className={styles.small}>
                {t.extraChat}: {formatRupees(snap.chat.pricePaise)} · {t.extraLive}: {formatRupees(snap.live.pricePaise)}
              </p>
            </section>

            <section className={styles.card}>
              <strong>{t.topupTitle}</strong>
              <p className={styles.small}>{t.topupSub}</p>
              <div className={styles.chips}>
                {TOPUP_PRESETS_PAISE.map((paise) => {
                  const key = `topup-${paise}`;
                  const running = pendingKey === key;
                  return (
                    <button
                      key={paise}
                      type="button"
                      className={styles.chip}
                      aria-busy={running}
                      onClick={() => void topup(paise)}
                    >
                      {running ? "…" : formatRupees(paise)}
                    </button>
                  );
                })}
              </div>
              <p className={styles.small}>{t.bonus.replace("₹100", formatRupees(FIRST_TOPUP_BONUS_MIN_PAISE))}</p>
            </section>

            <section className={styles.card}>
              <strong>{t.plansTitle}</strong>
              {PAID_PLANS.map((plan) => {
                const inc = INCLUDED_PER_DAY[plan];
                const current = snap.plan === plan;
                const running = pendingKey === `plan-${plan}`;
                return (
                  <div key={plan} className={styles.plan}>
                    <div>
                      <div className={styles.planName}>{PLAN_LABEL[plan]}</div>
                      <div className={styles.small}>
                        {formatRupees(PLAN_PRICE_PAISE[plan])} {t.month}
                      </div>
                      <div className={styles.small}>
                        {t.perDay}: {inc.chat} {t.chats}, {inc.live} {t.lives}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={styles.planBtn}
                      aria-busy={running}
                      disabled={current}
                      onClick={() => void subscribe(plan)}
                    >
                      {current ? t.current : running ? "…" : t.take}
                    </button>
                  </div>
                );
              })}
            </section>
          </>
        )}

        {message && (
          <p className={styles.note} role="status">
            {message}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}