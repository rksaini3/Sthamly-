// Sthamly AI web: login aur signup page (Blueprint 3.0, section 9 aur 10)
// Ek hi form, do modes: login aur signup. Login hone par App.tsx ka
// RedirectIfSignedIn khud /chat par bhejta hai, yahan navigate nahi hota.
// Errors AuthProvider se Hindi mein aate hain. Raw error yahan nahi dikhta.

import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";

type Mode = "login" | "signup";

const CONFIRM_MESSAGE =
  "ईमेल पर भेजा गया लिंक खोलकर अपना खाता कन्फर्म करें, फिर लॉग-इन करें।";

export function LoginPage() {
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
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

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <h1 id="auth-title" className="auth-title">
          Sthamly AI
        </h1>
        <p className="auth-subtitle">{isSignup ? "नया खाता बनाएँ" : "लॉग-इन करें"}</p>

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
      </section>
    </main>
  );
}