"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteOutputButton({ outputId }: { outputId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm("क्या आप यह हटाना चाहते हैं? यह वापस नहीं आएगा।")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/outputs/${outputId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setErr(json?.error?.message ?? "हट नहीं पाया, दोबारा कोशिश करें");
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
      <button type="button" className="btn btn-ghost btn-block" onClick={remove} disabled={busy}>
        {busy ? "हट रहा है…" : "हटाएं"}
      </button>
      {err && <p className="alert alert-error" style={{ margin: 0 }}>{err}</p>}
    </div>
  );
}