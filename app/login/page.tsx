"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Method = "phone" | "email";
type PhoneStep = "enter" | "otp";

// OTP दोबारा भेजने से पहले इंतज़ार (सेकंड)
const RESEND_SECONDS = 30;

const inputStyle: CSSProperties = {
  display: "block",
  width: "100%",
  padding: 10,
  fontSize: "1rem",
  marginTop: 4,
  boxSizing: "border-box",
};

const googleButtonStyle: CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  fontSize: "1rem",
  fontWeight: 600,
  borderRadius: 12,
  border: "1px solid #2a2a2a",
  background: "#1b1b1b",
  color: "#f5f5f5",
  cursor: "pointer",
  marginBottom: 16,
};

// भारतीय मोबाइल: 10 अंक (आगे +91) या 91 के साथ 12 अंक
function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) {
    return `+${digits}`;
  }
  return null;
}

// next सिर्फ़ अपनी साइट के अंदर का रास्ता (open redirect से बचाव)
function safeNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
}

// Supabase की अंग्रेज़ी गलती को सादा हिंदी संदेश में बदलें
function friendly(err: unknown, fallback: string): string {
  const text = err instanceof Error ? err.message.toLowerCase() : "";
  if (text.includes("rate") || text.includes("too many") || text.includes("seconds")) {
    return "थोड़ी देर बाद कोशिश करें";
  }
  if (text.includes("invalid") || text.includes("expired")) return "OTP गलत या पुराना है";
  return fallback;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkFailed = searchParams.get("error") === "link";
  const next = safeNext(searchParams.get("next"));

  const [method, setMethod] = useState<Method>("phone");
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("enter");
  const [phoneInput, setPhoneInput] = useState("");
  // E.164 नंबर (+91...), OTP भेजने के बाद यही इस्तेमाल होता है
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  // दोबारा OTP भेजने का उलटी गिनती
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function sendOtp(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    const e164 = toE164(phoneInput);
    if (!e164) {
      setMessage("सही मोबाइल नंबर डालें (10 अंक)");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
      if (error) throw error;
      setPhone(e164);
      setOtp("");
      setPhoneStep("otp");
      setWait(RESEND_SECONDS);
    } catch (err) {
      setMessage(friendly(err, "OTP नहीं भेजा जा सका, दोबारा कोशिश करें"));
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      setMessage("6 अंक का OTP डालें");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.verifyOtp({ phone, token: otp, type: "sms" });
      if (error) throw error;
      // सत्र बन गया: सही पन्ने पर भेजें (busy चालू रहे, ताकि दोबारा टैप न हो)
      router.replace(next);
      router.refresh();
    } catch (err) {
      setMessage(friendly(err, "OTP गलत या पुराना है"));
      setBusy(false);
    }
  }

  async function handleEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const callback = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: callback },
      });
      if (error) throw error;
      setEmailSent(true);
    } catch (err) {
      setMessage(friendly(err, "लिंक नहीं भेजा जा सका, दोबारा कोशिश करें"));
    } finally {
      setBusy(false);
    }
  }

  // Google के लिए: query string नहीं, ताकि Supabase redirect URL को सही पहचाने
  async function handleGoogle() {
    setBusy(true);
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      // सफल होने पर ब्राउज़र Google पर चला जाता है
      if (error) throw error;
    } catch (err) {
      setMessage(friendly(err, "Google से लॉग-इन नहीं हो पाया"));
      setBusy(false);
    }
  }

  function switchMethod() {
    setMethod((m) => (m === "phone" ? "email" : "phone"));
    setMessage(null);
    setEmailSent(false);
  }

  const maskedPhone = phone ? `${phone.slice(0, 3)} •••••${phone.slice(-4)}` : "";

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "32px 20px" }}>
      <h1 style={{ marginTop: 0 }}>लॉग-इन करें</h1>

      {linkFailed && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          लिंक पुराना या गलत है। नया लिंक मंगाएं।
        </p>
      )}

      <button type="button" onClick={handleGoogle} disabled={busy} style={googleButtonStyle}>
        Google से लॉग-इन करें
      </button>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          color: "#a3a3a3",
          fontSize: "0.9rem",
          marginBottom: 16,
        }}
      >
        <span style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
        या
        <span style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
      </div>

      {method === "phone" && phoneStep === "enter" && (
        <form onSubmit={sendOtp}>
          <label style={{ display: "block", marginBottom: 12, fontWeight: 600 }}>
            मोबाइल नंबर
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: "1rem", fontWeight: 600 }}>+91</span>
              <input
                type="tel"
                inputMode="numeric"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                required
                autoComplete="tel-national"
                placeholder="98765 43210"
                maxLength={14}
                style={{ ...inputStyle, marginTop: 0 }}
              />
            </div>
          </label>

          {message && (
            <p role="alert" style={{ color: "#b91c1c" }}>
              {message}
            </p>
          )}

          <Button type="submit" block disabled={busy}>
            {busy ? "भेजा जा रहा है…" : "OTP भेजें"}
          </Button>
        </form>
      )}

      {method === "phone" && phoneStep === "otp" && (
        <form onSubmit={verifyOtp}>
          <p style={{ marginTop: 0 }}>
            <strong>{maskedPhone}</strong> पर 6 अंक का OTP भेजा गया है।
          </p>

          <label style={{ display: "block", marginBottom: 12, fontWeight: 600 }}>
            OTP
            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              autoComplete="one-time-code"
              placeholder="123456"
              style={{ ...inputStyle, letterSpacing: "0.3em" }}
            />
          </label>

          {message && (
            <p role="alert" style={{ color: "#b91c1c" }}>
              {message}
            </p>
          )}

          <Button type="submit" block disabled={busy}>
            {busy ? "जांच हो रही है…" : "लॉग-इन करें"}
          </Button>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, gap: 8 }}>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setPhoneStep("enter");
                setMessage(null);
              }}
            >
              नंबर बदलें
            </Button>
            <Button type="button" variant="ghost" disabled={busy || wait > 0} onClick={() => sendOtp()}>
              {wait > 0 ? `दोबारा भेजें (${wait}s)` : "OTP दोबारा भेजें"}
            </Button>
          </div>
        </form>
      )}

      {method === "email" && !emailSent && (
        <form onSubmit={handleEmail}>
          <label style={{ display: "block", marginBottom: 12, fontWeight: 600 }}>
            ईमेल
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="aap@example.com"
              style={inputStyle}
            />
          </label>

          {message && (
            <p role="alert" style={{ color: "#b91c1c" }}>
              {message}
            </p>
          )}

          <Button type="submit" block disabled={busy}>
            {busy ? "भेजा जा रहा है…" : "लॉग-इन लिंक भेजें"}
          </Button>
        </form>
      )}

      {method === "email" && emailSent && (
        <div>
          <p>
            <strong>{email}</strong> पर लॉग-इन लिंक भेज दिया गया है। अपना ईमेल खोलें और लिंक पर
            क्लिक करें।
          </p>
          <p style={{ color: "#a3a3a3", fontSize: "0.9rem" }}>ईमेल न दिखे तो Spam फोल्डर देखें।</p>
          <Button type="button" variant="ghost" onClick={() => setEmailSent(false)}>
            दूसरा ईमेल डालें
          </Button>
        </div>
      )}

      <div style={{ marginTop: 24, textAlign: "center" }}>
        <Button type="button" variant="ghost" onClick={switchMethod} disabled={busy}>
          {method === "phone" ? "ईमेल से लॉग-इन करें" : "मोबाइल नंबर से लॉग-इन करें"}
        </Button>
      </div>
    </main>
  );
}

// useSearchParams के लिए Suspense ज़रूरी है (Next.js की शर्त)
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
