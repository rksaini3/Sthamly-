"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function ReportButton({ id }: { id: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function report() {
    setState("busy");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc("report_announcement", { p_id: id });
      if (error) throw error;
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return <span className="muted">रिपोर्ट हो गया, धन्यवाद</span>;
  }

  return (
    <div className="row" style={{ justifyContent: "flex-end" }}>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ minHeight: 36, padding: "0 12px", fontSize: "0.85rem" }}
        onClick={report}
        disabled={state === "busy"}
      >
        {state === "error" ? "दोबारा कोशिश करें" : "रिपोर्ट करें"}
      </button>
    </div>
  );
}