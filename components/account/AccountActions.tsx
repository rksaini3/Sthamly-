"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearLocalChatCache } from "@/lib/offline-cache";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Dict } from "@/lib/i18n";

// सर्वर पर यही शब्द जांचा जाता है, इसलिए दोनों भाषाओं में यही रहेगा
const CONFIRM_TEXT = "हां हटाओ";

export function AccountActions({ dict }: { dict: Dict }) {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setError(null);
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      // फ़ोन में सेव की हुई चैट हटाएं, ताकि अगला व्यक्ति उन्हें न देखे
      await clearLocalChatCache();
      router.replace("/login");
      router.refresh();
    } catch {
      setError(dict.errLogout);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: typed.trim() }),
      });
      if (!res.ok) {
        setError(dict.errDelete);
        return;
      }
      try {
        const supabase = createSupabaseBrowserClient();
        await supabase.auth.signOut();
      } catch {
        // खाता पहले ही हट चुका है, साइन-आउट विफल हो तो भी ठीक है
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError(dict.errNetwork);
    } finally {
      setBusy(false);
    }
  }

  const canDelete = !busy && typed.trim() === CONFIRM_TEXT;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <button type="button" className="btn btn-ghost btn-block" onClick={logout} disabled={busy}>
        {dict.logout}
      </button>

      <div className="card stack" style={{ gap: 10 }}>
        <strong>{dict.deleteTitle}</strong>
        <p className="muted">{dict.deleteBody}</p>

        {!showDelete ? (
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={() => setShowDelete(true)}
          >
            {dict.deleteAsk}
          </button>
        ) : (
          <>
            <p className="muted">
              {dict.deleteTypeHint} <strong style={{ color: "var(--ink)" }}>{CONFIRM_TEXT}</strong>
            </p>
            <input
              className="input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={CONFIRM_TEXT}
            />
            <button
              type="button"
              className="btn btn-danger btn-block"
              disabled={!canDelete}
              onClick={deleteAccount}
            >
              {busy ? dict.deleting : dict.deleteBtn}
            </button>
          </>
        )}

        {error && <p className="alert alert-error">{error}</p>}
      </div>
    </div>
  );
}