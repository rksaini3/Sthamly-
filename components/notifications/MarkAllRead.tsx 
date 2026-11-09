"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MarkAllRead({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function markAll() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/notifications/read", { method: "POST" });
      if (!res.ok) {
        setErr("सूचनाएं अपडेट नहीं हो पाईं, दोबारा कोशिश करें");
        return;
      }
      router.refresh();
    } catch {
      setErr("नेटवर्क की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <button
        type="button"
        className="btn btn-ghost btn-block"
        onClick={markAll}
        disabled={busy || disabled}
      >
        {busy ? "अपडेट हो रहा है…" : "सब पढ़ लिया करें"}
      </button>
      {err && <p className="alert alert-error" style={{ margin: 0 }}>{err}</p>}
    </div>
  );
}