"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ReportButton } from "@/components/feed/ReportButton";
import { formatDate } from "@/lib/format";

export interface FeedComment {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
}

const MAX = 300;

export function CommentsSection({
  announcementId,
  comments,
  loggedIn,
}: {
  announcementId: string;
  comments: FeedComment[];
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    const body = text.trim();
    if (body.length === 0) {
      setErr("कमेंट लिखें");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/announcements/${announcementId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(json?.error?.message ?? "कमेंट नहीं हो पाया, दोबारा कोशिश करें");
        return;
      }
      setText("");
      router.refresh();
    } catch {
      setErr("नेटवर्क की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      {comments.length === 0 && (
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>अभी कोई कमेंट नहीं है।</p>
      )}

      {comments.map((c) => (
        <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div className="row" style={{ gap: 8 }}>
            <strong style={{ fontSize: "0.9rem" }}>{c.author_name}</strong>
            <span className="job-date">{formatDate(c.created_at)}</span>
          </div>
          <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "0.95rem" }}>{c.body}</p>
          <ReportButton id={c.id} kind="comment" />
        </div>
      ))}

      {loggedIn ? (
        <div className="stack" style={{ gap: 6 }}>
          <textarea
            className="input"
            rows={2}
            maxLength={MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="कमेंट लिखें"
            disabled={busy}
          />
          {err && <p className="alert alert-error" style={{ margin: 0 }}>{err}</p>}
          <div className="row">
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              {text.length}/{MAX}
            </span>
            <button type="button" className="btn btn-primary" onClick={send} disabled={busy}>
              {busy ? "भेज रहे हैं…" : "भेजें"}
            </button>
          </div>
        </div>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          कमेंट करने के लिए <Link href="/login?next=/feed">लॉग-इन</Link> करें।
        </p>
      )}
    </div>
  );
}