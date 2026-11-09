"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CommentsSection, type FeedComment } from "@/components/feed/CommentsSection";
import { ReportButton } from "@/components/feed/ReportButton";
import { CommentIcon, CopyIcon, SendIcon, ShareIcon } from "@/components/feed/icons";
import styles from "@/components/feed/FeedCard.module.css";

const FEED_URL = "https://sthamly.com/feed";
const MAX = 500;

function PencilIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function TrashIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6l1 14h10l1-14" />
    </svg>
  );
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data.error?.message ?? "कुछ गड़बड़ हुई, दोबारा कोशिश करें";
  } catch {
    return "कुछ गड़बड़ हुई, दोबारा कोशिश करें";
  }
}

export interface FeedCardProps {
  id: string;
  shopName: string;
  body: string;
  time: string;
  comments: FeedComment[];
  loggedIn: boolean;
  // घोषणा इसी user ने बनाई है तो बदलने और हटाने के बटन दिखेंगे
  isOwner: boolean;
}

export function FeedCard({ id, shopName, body, time, comments, loggedIn, isOwner }: FeedCardProps) {
  const router = useRouter();
  const [showComments, setShowComments] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(body);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

  const shareText = `📢 ${shopName}\n${body}\n\n${FEED_URL}`;
  const waLink = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const initial = (shopName.trim().charAt(0) || "S").toUpperCase();

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2000);
    return () => clearTimeout(t);
  }, [note]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareText);
      setNote("कॉपी हो गया");
    } catch {
      setNote("कॉपी नहीं हो पाया");
    }
  }

  async function share() {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ text: shareText });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }
    await copy();
  }

  function startEdit() {
    setEditText(body);
    setErr(null);
    setEditing(true);
  }

  async function saveEdit() {
    const next = editText.trim();
    if (next.length < 5) {
      setErr("कम से कम 5 अक्षर लिखें");
      return;
    }
    if (next === body) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/announcements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: next }),
      });
      if (!res.ok) {
        setErr(await readError(res));
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setErr("नेटवर्क की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("क्या आप यह घोषणा हटाना चाहते हैं?")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/announcements/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setErr(await readError(res));
        return;
      }
      setGone(true);
      router.refresh();
    } catch {
      setErr("नेटवर्क की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusy(false);
    }
  }

  if (gone) return null;

  return (
    <article className={styles.item}>
      <div className={styles.avatar} aria-hidden="true">
        {initial}
      </div>

      <div className={styles.main}>
        <div className={styles.head}>
          <strong className={styles.name}>{shopName}</strong>
          <span className={styles.time}>{time}</span>
        </div>

        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea
              className="input"
              rows={3}
              maxLength={MAX}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              disabled={busy}
              aria-label="घोषणा बदलें"
            />
            {err && <p className="alert alert-error" style={{ margin: 0 }}>{err}</p>}
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditing(false)}
                disabled={busy}
              >
                रद्द करें
              </button>
              <button type="button" className="btn btn-primary" onClick={saveEdit} disabled={busy}>
                {busy ? "सेव हो रहा है…" : "सेव करें"}
              </button>
            </div>
          </div>
        ) : (
          <p className={styles.body}>{body}</p>
        )}

        {!editing && (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.action}
              onClick={() => setShowComments((v) => !v)}
              aria-expanded={showComments}
              aria-label="कमेंट देखें"
            >
              <CommentIcon />
              <span className={styles.count}>{comments.length}</span>
            </button>

            <button type="button" className={styles.action} onClick={share} aria-label="शेयर करें">
              <ShareIcon />
            </button>

            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.action}
              aria-label="WhatsApp पर भेजें"
              title="WhatsApp"
            >
              <SendIcon />
            </a>

            <button type="button" className={styles.action} onClick={copy} aria-label="कॉपी करें" title="कॉपी करें">
              <CopyIcon />
            </button>

            {isOwner ? (
              <>
                <button
                  type="button"
                  className={styles.action}
                  onClick={startEdit}
                  disabled={busy}
                  aria-label="घोषणा बदलें"
                  title="बदलें"
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  className={styles.action}
                  onClick={remove}
                  disabled={busy}
                  aria-label="घोषणा हटाएं"
                  title="हटाएं"
                >
                  <TrashIcon />
                </button>
              </>
            ) : (
              <ReportButton id={id} kind="announcement" compact className={styles.action} />
            )}
          </div>
        )}

        {!editing && err && <p className={styles.note}>{err}</p>}
        {note && <p className={styles.note}>{note}</p>}

        {showComments && !editing && (
          <div className={styles.comments}>
            <CommentsSection announcementId={id} comments={comments} loggedIn={loggedIn} />
          </div>
        )}
      </div>
    </article>
  );
}