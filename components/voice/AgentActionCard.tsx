"use client";

import { useState } from "react";
import styles from "@/components/voice/VoiceAssistant.module.css";
import type { Lang } from "@/lib/i18n";

export interface ActionCardData {
  id: string;
  tool: string;
  summary: string;
  expiresAt: string;
}

type CardState = "idle" | "busy" | "approved" | "rejected" | "done" | "failed" | "expired";

interface Props {
  action: ActionCardData;
  lang?: Lang;
  // फ़ैसले के बाद चैट में नतीजा जोड़ने के लिए
  onDecided?: (text: string) => void;
}

const T = {
  hi: {
    title: "मंज़ूरी चाहिए",
    approve: "मंज़ूरी दें",
    reject: "रद्द करें",
    working: "हो रहा है…",
    approvedDone: "काम हो गया",
    rejectedDone: "काम रद्द किया गया",
    failedDone: "काम नहीं हो पाया",
    expiredDone: "समय निकल गया, काम दोबारा माँगें",
    alreadyDone: "इस काम पर पहले ही फ़ैसला हो चुका है",
    networkErr: "नेटवर्क की गड़बड़ी, दोबारा कोशिश करें",
    serverErr: "काम में गड़बड़ हुई",
  },
  en: {
    title: "Approval needed",
    approve: "Approve",
    reject: "Cancel",
    working: "Working…",
    approvedDone: "Done",
    rejectedDone: "Cancelled",
    failedDone: "Could not complete",
    expiredDone: "Time ran out, please ask again",
    alreadyDone: "This was already decided",
    networkErr: "Network problem, please try again",
    serverErr: "Something went wrong",
  },
} as const;

export function AgentActionCard({ action, lang = "hi", onDecided }: Props) {
  const t = T[lang];
  const [state, setState] = useState<CardState>(
    new Date(action.expiresAt).getTime() <= Date.now() ? "expired" : "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  const locked = state !== "idle";

  async function decide(decision: "approve" | "reject") {
    if (locked) return;
    setState("busy");
    setMessage(null);

    try {
      const res = await fetch("/api/agent/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: action.id, decision }),
      });

      const data = (await res.json().catch(() => null)) as
        | { status?: string; reply?: string; error?: { message?: string } }
        | null;

      // पहले ही फ़ैसला हो चुका (दूसरे टैब या दोबारा क्लिक से)
      if (res.status === 409) {
        setState("done");
        setMessage(t.alreadyDone);
        return;
      }
      // समय निकल गया
      if (res.status === 410) {
        setState("expired");
        setMessage(t.expiredDone);
        return;
      }
      if (!res.ok) {
        setState("idle");
        setMessage(data?.error?.message ?? t.serverErr);
        return;
      }

      // सफल या विफल कामयाबी, server का status मानें
      if (decision === "reject") {
        setState("rejected");
        setMessage(t.rejectedDone);
        onDecided?.(t.rejectedDone);
        return;
      }

      const ok = data?.status === "done";
      setState(ok ? "approved" : "failed");
      const text = data?.reply ?? (ok ? t.approvedDone : t.failedDone);
      setMessage(text);
      onDecided?.(text);
    } catch {
      // नेटवर्क टूटा: कार्ड फिर से खुले, ताकि user दोबारा कोशिश कर सके
      setState("idle");
      setMessage(t.networkErr);
    }
  }

  const finished = state === "approved" || state === "rejected" || state === "done" || state === "failed" || state === "expired";

  return (
    <div className={styles.bubbleBot} role="group" aria-label={t.title}>
      <p className={styles.label}>{t.title}</p>
      <p className={styles.offerText}>{action.summary}</p>

      {!finished && (
        <div className={styles.btnRow}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => void decide("approve")}
            disabled={locked}
          >
            {state === "busy" ? t.working : t.approve}
          </button>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => void decide("reject")}
            disabled={locked}
          >
            {t.reject}
          </button>
        </div>
      )}

      {message && (
        <p
          className={styles.muted}
          role={state === "failed" || state === "idle" ? "alert" : "status"}
        >
          {message}
        </p>
      )}
    </div>
  );
}