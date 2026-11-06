"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "sent" | "error";

function LoginForm() {
  const searchParams = useSearchParams();
  const linkFailed = searchParams.get("error") === "link";

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const next = searchParams.get("next") ?? "/dashboard";
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });

      if (error) throw error;
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "कुछ गड़बड़ हुई, दोबारा कोशिश करें");
    }
  }

  return (
    <main className="page stack">
      <div className="stack" style={{ gap: 8 }}>
        <p className="brand">Sthamly</p>
        <h1>लॉग-इन करें</h1>
        <p className="muted">ईमेल पर एक लिंक आएगा। उस पर क्लिक करें, पासवर्ड की ज़रूरत नहीं।</p>
      </div>

      {linkFailed && (
        <p role="alert" className="alert alert-error">
          लिंक पुराना या गलत है। नया लिंक मंगाएं।
        </p>
      )}

      {status === "sent" ? (
        <section className="card stack">
          <h2>ईमेल भेज दिया गया है</h2>
          <p>
            <strong>{email}</strong> पर लॉग-इन लिंक गया है।
          </p>
          <p className="muted">ईमेल न दिखे तो Spam फोल्डर देखें।</p>
          <Button variant="ghost" block onClick={() => setStatus("idle")}>
            दूसरा ईमेल डालें
          </Button>
        </section>
      ) : (
        <form className="card stack" onSubmit={handleSubmit}>
          <label className="field">
            ईमेल
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="aap@example.com"
            />
          </label>

          {status === "error" && message && (
            <p role="alert" className="alert alert-error">
              {message}
            </p>
          )}

          <Button type="submit" block disabled={status === "sending"}>
            {status === "sending" ? "भेजा जा रहा है…" : "लॉग-इन लिंक भेजें"}
          </Button>
        </form>
      )}
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