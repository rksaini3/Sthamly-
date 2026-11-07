"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const CONFIRM_TEXT = "हां हटाओ";

export function AccountActions() {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  async function deleteData() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: typed.trim() }),
      });
      if (!res.ok) {
        setError("डेटा नहीं हट पाया, दोबारा कोशिश करें");
        return;
      }
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      router.replace("/");
      router.refresh();
    } catch {
      setError("नेटवर्क की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <button type="button" className="btn btn-ghost btn-block" onClick={logout}>
        लॉग-आउट
      </button>

      <div className="card stack">
        <strong>मेरा डेटा हटाएं</strong>
        <p className="muted" style={{ margin: 0 }}>
          दुकान, फ़ोटो, पोस्टर, बातचीत और खाता हमेशा के लिए हट जाएगा। यह वापस नहीं होगा।
        </p>

        {!showDelete ? (
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={() => setShowDelete(true)}
          >
            डेटा हटाने की पुष्टि करें
          </button>
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>
              पक्का करने के लिए नीचे लिखें: <strong>{CONFIRM_TEXT}</strong>
            </p>
            <input
              className="input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={CONFIRM_TEXT}
            />
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={busy || typed.trim() !== CONFIRM_TEXT}
              onClick={deleteData}
            >
              डेटा हमेशा के लिए हटाएं
            </button>
          </>
        )}

        {error && <p className="alert alert-error">{error}</p>}
      </div>
    </div>
  );
}