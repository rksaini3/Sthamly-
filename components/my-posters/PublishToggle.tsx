"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PublishToggle({ outputId, initial }: { outputId: string; initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/outputs/${outputId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !on }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setErr(json?.error?.message ?? "नहीं हो पाया");
        return;
      }
      setOn(!on);
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
        className={on ? "btn btn-ghost btn-block" : "btn btn-primary btn-block"}
        onClick={toggle}
        disabled={busy}
      >
        {busy ? "रुकिए…" : on ? "फ़ीड से हटाएं" : "फ़ीड पर सार्वजनिक करें"}
      </button>
      {err && <p className="alert alert-error" style={{ margin: 0 }}>{err}</p>}
    </div>
  );
}