"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function ReportButton({
  id,
  kind = "announcement",
}: {
  id: string;
  kind?: "announcement" | "comment";
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function report() {
    if (!window.confirm("क्या आप इसे रिपोर्ट करना चाहते हैं?")) return;
    setBusy(true);
    setErr(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } =
        kind === "comment"
          ? await supabase.rpc("report_comment", { p_id: id })
          : await supabase.rpc("report_announcement", { p_id: id });
      if (error) {
        setErr("रिपोर्ट नहीं हो पाया, दोबारा कोशिश करें");
        return;
      }
      setDone(true);
    } catch {
      setErr("नेटवर्क की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
        रिपोर्ट हो गया, धन्यवाद
      </p>
    );
  }

  return (
    <div className="stack" style={{ gap: 4 }}>
      <button type="button" className="btn btn-ghost" onClick={report} disabled={busy}>
        {busy ? "भेज रहे हैं…" : "रिपोर्ट करें"}
      </button>
      {err && <p className="alert alert-error" style={{ margin: 0 }}>{err}</p>}
    </div>
  );
}