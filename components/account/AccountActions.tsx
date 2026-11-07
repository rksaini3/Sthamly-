"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const CONFIRM_TEXT = "हां हटाओ";

const box: React.CSSProperties = {
  background: "#1b1b1b",
  border: "1px solid #2a2a2a",
  borderRadius: 16,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const btnBase: React.CSSProperties = {
  width: "100%",
  borderRadius: 12,
  padding: "12px 16px",
  fontSize: 15,
  fontWeight: 600,
  font: "inherit",
  cursor: "pointer",
  border: "1px solid #2a2a2a",
};

export function AccountActions() {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } finally {
      router.replace("/login");
      router.refresh();
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
        setError("खाता नहीं हट पाया, दोबारा कोशिश करें");
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
      setError("नेटवर्क की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <button
        type="button"
        onClick={logout}
        disabled={busy}
        style={{ ...btnBase, background: "transparent", color: "#f5f5f5" }}
      >
        लॉग-आउट
      </button>

      <div style={box}>
        <strong>मेरा खाता हटाएं</strong>
        <p style={{ margin: 0, color: "#a3a3a3", fontSize: 14, lineHeight: 1.5 }}>
          दुकान, फ़ोटो, पोस्टर, बातचीत और खाता हमेशा के लिए हट जाएगा। यह वापस नहीं होगा।
        </p>

        {!showDelete ? (
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            style={{ ...btnBase, background: "transparent", color: "#f5f5f5" }}
          >
            खाता हटाने की पुष्टि करें
          </button>
        ) : (
          <>
            <p style={{ margin: 0, color: "#a3a3a3", fontSize: 14 }}>
              पक्का करने के लिए नीचे लिखें: <strong style={{ color: "#f5f5f5" }}>{CONFIRM_TEXT}</strong>
            </p>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={CONFIRM_TEXT}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "#0f0f0f",
                color: "#f5f5f5",
                border: "1px solid #2a2a2a",
                borderRadius: 12,
                padding: "12px 14px",
                fontSize: 15,
                font: "inherit",
              }}
            />
            <button
              type="button"
              onClick={deleteAccount}
              disabled={busy || typed.trim() !== CONFIRM_TEXT}
              style={{
                ...btnBase,
                background: typed.trim() === CONFIRM_TEXT ? "#c2410c" : "#2a2a2a",
                color: "#fff",
                border: "none",
                opacity: busy ? 0.6 : 1,
                cursor: busy || typed.trim() !== CONFIRM_TEXT ? "not-allowed" : "pointer",
              }}
            >
              {busy ? "हटाया जा रहा है..." : "खाता हमेशा के लिए हटाएं"}
            </button>
          </>
        )}

        {error && <p style={{ margin: 0, color: "#f87171", fontSize: 14 }}>{error}</p>}
      </div>
    </div>
  );
}