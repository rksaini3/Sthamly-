"use client";

import { useEffect, useState } from "react";
import { CommentsSection, type FeedComment } from "@/components/feed/CommentsSection";
import { ReportButton } from "@/components/feed/ReportButton";
import { CommentIcon, CopyIcon, SendIcon, ShareIcon } from "@/components/feed/icons";
import styles from "@/components/feed/FeedCard.module.css";

const FEED_URL = "https://sthamly.com/feed";

export interface FeedCardProps {
  id: string;
  shopName: string;
  body: string;
  time: string;
  comments: FeedComment[];
  loggedIn: boolean;
}

export function FeedCard({ id, shopName, body, time, comments, loggedIn }: FeedCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [note, setNote] = useState<string | null>(null);

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
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    await copy();
  }

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

        <p className={styles.body}>{body}</p>

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

          <ReportButton id={id} kind="announcement" compact className={styles.action} />
        </div>

        {note && <p className={styles.note}>{note}</p>}

        {showComments && (
          <div className={styles.comments}>
            <CommentsSection announcementId={id} comments={comments} loggedIn={loggedIn} />
          </div>
        )}
      </div>
    </article>
  );
}