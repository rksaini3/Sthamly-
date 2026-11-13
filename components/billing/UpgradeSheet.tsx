"use client";

import { useEffect, useState } from "react";
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

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  handler: () => void;
  modal?: { ondismiss?: () => void };
}
interface RazorpayWindow extends Window {
  Razorpay?: new (options: RazorpayOptions) => { open(): void };
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const PAID_PLANS: PaidPlan[] = ["starter", "premium", "business"];

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
  const [busy, setBusy] = useState(false);

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

  async function topup(amountPaise: number) {
    setBusy(true);
    setMessage(t.opening);
    try {
      const res = await fetch("/api/billing/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountPaise }),
      });
      const data = (await res.json()) as { ok?: boolean; orderId?: string; amountPaise?: number; keyId?: string };
      if (!res.ok || !data.ok || !data.orderId || !data.keyId) throw new Error("order failed");
      if (!(await loadCheckout())) throw new Error("script failed");
      const Razorpay = (window as RazorpayWindow).Razorpay;
      if (!Razorpay) throw new Error("no razorpay");
      new Razorpay({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amountPaise ?? amountPaise,
        currency: "INR",
        name: "Sthamly",
        handler: () => {
          setMessage(t.paid);
          // पैसा webhook से आता है, इसलिए थोड़ी देर बाद ताज़ा करें
          setTimeout(() => void load(), 3500);
        },
        modal: { ondismiss: () => setMessage(null) },
      }).open();
    } catch {
      setMessage(t.payFail);
    } finally {
      setBusy(false);
    }
  }

  async function subscribe(plan: PaidPlan) {
    setBusy(true);
    setMessage(t.opening);
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, cycle: "monthly" }),
      });
      const data = (await res.json()) as { ok?: boolean; checkoutUrl?: string | null };
      if (!res.ok || !data.ok || !data.checkoutUrl) throw new Error("subscribe failed");
      window.location.href = data.checkoutUrl;
    } catch {
      setMessage(t.payFail);
      setBusy(false);
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
                {TOPUP_PRESETS_PAISE.map((paise) => (
                  <button key={paise} type="button" className={styles.chip} disabled={busy} onClick={() => void topup(paise)}>
                    {formatRupees(paise)}
                  </button>
                ))}
              </div>
              <p className={styles.small}>{t.bonus.replace("₹100", formatRupees(FIRST_TOPUP_BONUS_MIN_PAISE))}</p>
            </section>

            <section className={styles.card}>
              <strong>{t.plansTitle}</strong>
              {PAID_PLANS.map((plan) => {
                const inc = INCLUDED_PER_DAY[plan];
                const current = snap.plan === plan;
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
                      disabled={busy || current}
                      onClick={() => void subscribe(plan)}
                    >
                      {current ? t.current : t.take}
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