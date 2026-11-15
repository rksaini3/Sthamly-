import { useEffect, useState, type CSSProperties } from "react";
import { sendOtp, verifyOtp } from "../auth";

// भारतीय मोबाइल: 10 अंक, 6 से 9 से शुरू
const MOBILE = /^[6-9]\d{9}$/;
const RESEND_SECONDS = 30;

// Supabase के अंग्रेज़ी error सीधे नहीं दिखाते, log में जाते हैं
function friendly(error: unknown, fallback: string): string {
  console.error("login:", error instanceof Error ? error.message : "unknown");
  return fallback;
}

export function LoginScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  // Resend के लिए उलटी गिनती
  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  async function onSend() {
    if (busy) return;
    if (!MOBILE.test(phone)) {
      setError("10 अंकों का सही मोबाइल नंबर लिखें (6 से 9 से शुरू)");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendOtp(`+91${phone}`);
      setStep("otp");
      setOtp("");
      setWait(RESEND_SECONDS);
    } catch (e) {
      setError(friendly(e, "OTP नहीं भेजा गया। थोड़ी देर बाद दोबारा कोशिश करें।"));
    } finally {
      setBusy(false);
    }
  }

  async function onVerify() {
    if (busy) return;
    if (!/^\d{6}$/.test(otp)) {
      setError("6 अंकों का OTP लिखें");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyOtp(`+91${phone}`, otp);
      onDone();
    } catch (e) {
      setError(friendly(e, "OTP सही नहीं है या समय निकल गया। दोबारा भेजें।"));
    } finally {
      setBusy(false);
    }
  }

  if (step === "phone") {
    return (
      <section style={{ display: "grid", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 15 }}>अपना मोबाइल नंबर लिखें। हम 6 अंकों का OTP भेजेंगे।</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={prefix}>+91</span>
          <input
            inputMode="numeric"
            autoComplete="tel-national"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="9876543210"
            style={input}
          />
        </div>
        <button type="button" onClick={onSend} disabled={busy} style={primary(busy)}>
          OTP भेजें
        </button>
        {error && <p role="alert" style={errorText}>{error}</p>}
      </section>
    );
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 15 }}>
        +91 {phone} पर भेजा गया 6 अंकों का OTP लिखें।{" "}
        <button type="button" onClick={() => setStep("phone")} style={linkBtn}>
          नंबर बदलें
        </button>
      </p>
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        value={otp}
        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="------"
        style={{ ...input, letterSpacing: 6, textAlign: "center", fontSize: 22 }}
      />
      <button type="button" onClick={onVerify} disabled={busy} style={primary(busy)}>
        लॉग-इन करें
      </button>
      <button type="button" onClick={onSend} disabled={busy || wait > 0} style={ghost(busy || wait > 0)}>
        {wait > 0 ? `फिर भेजें (${wait} सेकंड)` : "OTP फिर से भेजें"}
      </button>
      {error && <p role="alert" style={errorText}>{error}</p>}
    </section>
  );
}

const input: CSSProperties = {
  flex: 1,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #d4d4d4",
  fontSize: 18,
  font: "inherit",
};

const prefix: CSSProperties = {
  padding: "12px 12px",
  borderRadius: 10,
  background: "#f5f5f4",
  fontWeight: 700,
};

const errorText: CSSProperties = { margin: 0, fontSize: 14, color: "#b91c1c" };

const linkBtn: CSSProperties = {
  border: "none",
  background: "none",
  color: "#1B1A17",
  fontWeight: 700,
  textDecoration: "underline",
  cursor: "pointer",
  padding: 0,
  font: "inherit",
};

function primary(disabled: boolean): CSSProperties {
  return {
    padding: "14px 16px",
    borderRadius: 999,
    border: "none",
    background: "#1B1A17",
    color: "#fff",
    fontWeight: 700,
    fontSize: 16,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

function ghost(disabled: boolean): CSSProperties {
  return {
    padding: "12px 16px",
    borderRadius: 999,
    border: "1px solid #d4d4d4",
    background: "#fff",
    color: "#1B1A17",
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}