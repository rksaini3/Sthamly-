// Sthamly AI web: login aur signup page (Blueprint 3.0, section 9 aur 10)
// Google login sabse upar, phir mobile OTP (WhatsApp) ya email aur password.
// Login hone par App.tsx ka RedirectIfSignedIn khud /chat par bhejta hai.
// Errors AuthProvider se Hindi mein aate hain. Raw error yahan nahi dikhta.

import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { PhoneOtpForm } from "../components/PhoneOtpForm";

type Mode = "login" | "signup";
// Login ka tarika: mobile OTP ya email.
type Method = "phone" | "email";

const CONFIRM_MESSAGE =
  "ईमेल पर भेजा गया लिंक खोलकर अपना खाता कन्फर्म करें, फिर लॉग-इन करें।";

// Google ka official "G" logo (inline SVG, koi external image nahi).
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.080 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.650-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.860-1.977 13.409-5.192l-6.190-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l.003-.002 6.190 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.650-.389-3.917z"
      />
    </svg>
  );
}

export function LoginPage() {
  const { signIn, signUp, signInWithGoogle } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [method, setMethod] = useState<Method>("phone");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isSignup = mode === "signup";

  function switchMode(next: Mode): void {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  function switchMethod(next: Method): void {
    setMethod(next);
    setError(null);
    setInfo(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      if (isSignup) {
        const result = await signUp(email, password, name);
        if (result.needsConfirmation) {
          // Email confirm baaki hai: login mode par le jaate hain, message ke saath.
          setPassword("");
          setMode("login");
          setInfo(CONFIRM_MESSAGE);
        }
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "कुछ गड़बड़ हो गई। दोबारा कोशिश करें।");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle(): Promise<void> {
    if (busy) return;

    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      // Successful hone par browser Google par redirect hota hai, isliye busy reset nahi karte.
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google से लॉग-इन नहीं हो सका।");
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <h1 id="auth-title" className="auth-title">
          Sthamly AI
        </h1>
        <p className="auth-subtitle">
          {method === "phone"
            ? "मोबाइल नंबर से लॉग-इन करें"
            : isSignup
              ? "नया खाता बनाएँ"
              : "लॉग-इन करें"}
        </p>

        <div className="auth-form">
          <button
            type="button"
            onClick={() => void handleGoogle()}
            disabled={busy}
            className="auth-google"
            aria-label="Google से लॉग-इन करें"
          >
            <GoogleIcon />
            <span>Google से लॉग-इन करें</span>
          </button>

          <div className="auth-divider" role="separator">
            <span>या</span>
          </div>

          <div className="auth-switch">
            <button
              type="button"
              className="auth-link"
              onClick={() => switchMethod("phone")}
              disabled={busy || method === "phone"}
            >
              मोबाइल नंबर से (WhatsApp OTP)
            </button>{" "}
            <button
              type="button"
              className="auth-link"
              onClick={() => switchMethod("email")}
              disabled={busy || method === "email"}
            >
              ईमेल से
            </button>
          </div>
        </div>

        {method === "phone" ? (
          <PhoneOtpForm />
        ) : (
          <>
            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              {isSignup && (
                <label className="auth-field">
                  <span>नाम (वैकल्पिक)</span>
                  <input
                    type="text"
                    name="name"
                    autoComplete="name"
                    maxLength={60}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={busy}
                  />
                </label>
              )}

              <label className="auth-field">
                <span>ईमेल</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
              </label>

              <label className="auth-field">
                <span>पासवर्ड</span>
                <input
                  type="password"
                  name="password"
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  minLength={8}
                  maxLength={72}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
              </label>

              {isSignup && <p className="auth-hint">पासवर्ड कम से कम 8 अक्षर का हो।</p>}

              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              {info && (
                <p className="auth-info" role="status">
                  {info}
                </p>
              )}

              <button type="submit" className="auth-submit" disabled={busy}>
                {busy ? "कृपया प्रतीक्षा करें…" : isSignup ? "खाता बनाएँ" : "लॉग-इन करें"}
              </button>
            </form>

            <p className="auth-switch">
              {isSignup ? "पहले से खाता है?" : "नया खाता चाहिए?"}{" "}
              <button
                type="button"
                className="auth-link"
                onClick={() => switchMode(isSignup ? "login" : "signup")}
                disabled={busy}
              >
                {isSignup ? "लॉग-इन करें" : "खाता बनाएँ"}
              </button>
            </p>
          </>
        )}
      </section>
    </main>
  );
}