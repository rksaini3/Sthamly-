// Sthamly AI web: mobile number se login. Pehle number, phir WhatsApp par aaya OTP.
// Naya number ho to khata apne-aap ban jaata hai. OTP ka timer aur dobara bhejne ka wait yahin hai.

import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";

// Dobara OTP bhejne se pehle kitne second ruken.
const RESEND_SECONDS = 45;

type Step = "phone" | "otp";

export function PhoneOtpForm() {
  const { signInWithPhone, verifyPhoneOtp } = useAuth();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [e164, setE164] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Dobara bhejne ka ulta timer, har second ghatta hai.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function sendOtp(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      const normalized = await signInWithPhone(phone);
      setE164(normalized);
      setOtp("");
      setStep("otp");
      setCooldown(RESEND_SECONDS);
      setInfo("OTP आपके WhatsApp पर भेजा गया है।");
    } catch (err) {
      setError(err instanceof Error ? err.message : "OTP नहीं भेजा जा सका।");
    } finally {
      setBusy(false);
    }
  }

  async function handlePhoneSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await sendOtp();
  }

  async function handleOtpSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy || e164 === null) return;

    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      // Safal hone par AuthProvider session badal deta hai, aur App ka redirect khud chalta hai.
      await verifyPhoneOtp(e164, otp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "OTP सही नहीं है।");
      setBusy(false);
    }
  }

  function changeNumber(): void {
    setStep("phone");
    setE164(null);
    setOtp("");
    setError(null);
    setInfo(null);
  }

  if (step === "phone") {
    return (
      <form className="auth-form" onSubmit={handlePhoneSubmit} noValidate>
        <label className="auth-field">
          <span>मोबाइल नंबर (+91)</span>
          <input
            type="tel"
            name="phone"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={14}
            placeholder="10 अंकों का नंबर"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={busy}
          />
        </label>

        <p className="auth-hint">
          OTP WhatsApp पर आएगा। नया नंबर हो तो खाता भी इसी से बनेगा।
        </p>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? "कृपया प्रतीक्षा करें…" : "OTP भेजें"}
        </button>
      </form>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleOtpSubmit} noValidate>
      <p className="auth-hint">{e164 ? `${e164} पर भेजा गया OTP डालें।` : ""}</p>

      <label className="auth-field">
        <span>OTP</span>
        <input
          type="text"
          name="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          disabled={busy}
        />
      </label>

      {info && (
        <p className="auth-info" role="status">
          {info}
        </p>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="auth-submit" disabled={busy}>
        {busy ? "जाँच हो रही है…" : "लॉग-इन करें"}
      </button>

      <div className="auth-switch">
        <button
          type="button"
          className="auth-link"
          onClick={() => void sendOtp()}
          disabled={busy || cooldown > 0}
        >
          {cooldown > 0 ? `दोबारा OTP भेजें (${cooldown}s)` : "दोबारा OTP भेजें"}
        </button>{" "}
        <button type="button" className="auth-link" onClick={changeNumber} disabled={busy}>
          नंबर बदलें
        </button>
      </div>
    </form>
  );
}