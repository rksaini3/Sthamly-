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
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "32px 20px" }}>
      <h1 style={{ marginTop: 0 }}>लॉग-इन करें</h1>

      {linkFailed && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          लिंक पुराना या गलत है। नया लिंक मंगाएं।
        </p>
      )}

      {status === "sent" ? (
        <div>
          <p>
            <strong>{email}</strong> पर लॉग-इन लिंक भेज दिया गया है। अपना ईमेल खोलें और लिंक पर
            क्लिक करें।
          </p>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            ईमेल न दिखे तो Spam फोल्डर देखें।
          </p>
          <Button type="button" onClick={() => setStatus("idle")}>
            दूसरा ईमेल डालें
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", marginBottom: 12, fontWeight: 600 }}>
            ईमेल
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="aap@example.com"
              style={{ display: "block", width: "100%", padding: 10, fontSize: "1rem", marginTop: 4 }}
            />
          </label>

          {status === "error" && message && (
            <p role="alert" style={{ color: "#b91c1c" }}>
              {message}
            </p>
          )}

          <Button type="submit" disabled={status === "sending"}>
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