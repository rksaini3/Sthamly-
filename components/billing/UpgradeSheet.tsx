"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { PLANS, TOPUP_PRESETS_PAISE, formatRupees } from "@/lib/pricing";

interface AssistantStatus {
  plan: string;
  walletPaise: number;
  chatsLeft: number;
  liveLeft: number;
  freeChats: number;
  freeLive: number;
  chatPricePaise: number;
  livePricePaise: number;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const PAID_PLANS = ["starter", "premium", "business"] as const;
type PaidPlan = (typeof PAID_PLANS)[number];

function loadCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("भुगतान स्क्रीन लोड नहीं हो पाई"));
    document.body.appendChild(script);
  });
}

export function UpgradeSheet({
  open,
  onClose,
  reason,
  onPaid,
}: {
  open: boolean;
  onClose: () => void;
  reason?: string;
  onPaid?: () => void;
}) {
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/assistant/status", { cache: "no-store" });
      if (res.ok) setStatus((await res.json()) as AssistantStatus);
    } catch {
      // नेटवर्क नहीं है तो पुरानी जानकारी ही रहने दें
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function topup(amountPaise: number) {
    setBusy(true);
    setMessage("");
    try {
      await loadCheckoutScript();
      const res = await fetch("/api/billing/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountPaise }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error("ऑर्डर नहीं बन पाया, दोबारा कोशिश करें");

      const Checkout = window.Razorpay;
      if (!Checkout) throw new Error("भुगतान स्क्रीन उपलब्ध नहीं है");

      const rzp = new Checkout({
        key: data.keyId,
        amount: data.amountPaise,
        currency: "INR",
        order_id: data.orderId,
        name: "Sthamly",
        description: "वॉलेट टॉप-अप",
        theme: { color: "#B5451B" },
        handler: () => {
          setMessage("भुगतान हो गया। बैलेंस कुछ सेकंड में दिखेगा।");
          setTimeout(() => {
            void load();
            onPaid?.();
          }, 3000);
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.open();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "कुछ गड़बड़ हुई");
    } finally {
      setBusy(false);
    }
  }

  async function subscribe(plan: PaidPlan) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, cycle: "monthly" }),
      });
      const data = await res.json();
      if (res.status === 409) throw new Error("आपका प्लान पहले से चालू है");
      if (!res.ok || !data.ok || !data.checkoutUrl) throw new Error("प्लान शुरू नहीं हो पाया");
      window.location.href = data.checkoutUrl;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "कुछ गड़बड़ हुई");
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div style={overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <div style={handle} />
        <h2 style={{ fontSize: 20, margin: "0 0 4px" }}>बढ़ाएं</h2>
        {reason && <p style={{ color: "#b00020", margin: "0 0 8px" }}>{reason}</p>}

        {status && (
          <div style={box}>
            <div>आज बची बातचीत: {status.chatsLeft} / {status.freeChats}</div>
            <div>आज बचे लाइव सत्र: {status.liveLeft} / {status.freeLive}</div>
            <div>वॉलेट: {formatRupees(status.walletPaise)}</div>
            <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
              मुफ़्त खत्म होने पर हर बातचीत {formatRupees(status.chatPricePaise)} और हर लाइव सत्र {formatRupees(status.livePricePaise)} वॉलेट से कटेगा।
            </div>
          </div>
        )}

        <h3 style={sectionTitle}>वॉलेट में पैसे डालें (पे-पर-यूज़)</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {TOPUP_PRESETS_PAISE.map((amount) => (
            <button key={amount} onClick={() => topup(amount)} disabled={busy} style={chip}>
              {formatRupees(amount)} डालें
            </button>
          ))}
        </div>

        <h3 style={sectionTitle}>मासिक प्लान (हर महीने, बिना सीमा की बातचीत)</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {PAID_PLANS.map((plan) => (
            <button key={plan} onClick={() => subscribe(plan)} disabled={busy} style={planCard}>
              <span style={{ textTransform: "capitalize", fontWeight: 600 }}>{plan}</span>
              <span>{formatRupees(PLANS[plan].monthlyPricePaise)} / महीना</span>
            </button>
          ))}
        </div>

        {message && <p style={{ marginTop: 12, fontSize: 14 }}>{message}</p>}
      </div>
    </div>
  );
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  zIndex: 50,
};

const sheet: CSSProperties = {
  background: "#fff",
  width: "100%",
  maxWidth: 560,
  borderRadius: "18px 18px 0 0",
  padding: "12px 16px 24px",
  maxHeight: "85vh",
  overflowY: "auto",
};

const handle: CSSProperties = {
  width: 40,
  height: 4,
  borderRadius: 2,
  background: "#ccc",
  margin: "0 auto 12px",
};

const box: CSSProperties = {
  background: "#FCEEDF",
  borderRadius: 12,
  padding: 12,
  fontSize: 15,
  display: "grid",
  gap: 4,
};

const sectionTitle: CSSProperties = {
  fontSize: 15,
  margin: "18px 0 8px",
};

const chip: CSSProperties = {
  background: "#fff",
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: "12px 8px",
  fontSize: 15,
  cursor: "pointer",
};

const planCard: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  background: "#fff",
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 15,
  cursor: "pointer",
};