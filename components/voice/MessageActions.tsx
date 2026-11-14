"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "@/components/voice/MessageActions.module.css";
import type { Lang } from "@/lib/i18n";
import { LABELS } from "@/lib/labels";

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const ICONS = {
  copy: (
    <Svg>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 012-2h9" />
    </Svg>
  ),
  check: (
    <Svg>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </Svg>
  ),
  like: (
    <Svg>
      <path d="M7 11v9H4v-9z" />
      <path d="M7 11l4-7a2 2 0 012 2v4h5.5a2 2 0 012 2.3l-1 6A2 2 0 0117.5 20H7" />
    </Svg>
  ),
  dislike: (
    <Svg>
      <path d="M17 13V4h3v9z" />
      <path d="M17 13l-4 7a2 2 0 01-2-2v-4H5.5a2 2 0 01-2-2.3l1-6A2 2 0 016.5 4H17" />
    </Svg>
  ),
  share: (
    <Svg>
      <path d="M12 15V3M7.5 7.5L12 3l4.5 4.5" />
      <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
    </Svg>
  ),
  speaker: (
    <Svg>
      <path d="M4 10v4h4l5 4V6L8 10z" />
      <path d="M16.5 9a4 4 0 010 6" />
    </Svg>
  ),
  stop: (
    <Svg>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </Svg>
  ),
  dots: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </svg>
  ),
  retry: (
    <Svg>
      <path d="M20 11a8 8 0 10-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </Svg>
  ),
  branch: (
    <Svg>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="9" r="2" />
      <path d="M6 7v10M18 11c0 4-6 3-12 6" />
    </Svg>
  ),
  shorter: (
    <Svg>
      <path d="M4 7h16M4 12h10M4 17h6" />
    </Svg>
  ),
  simpler: (
    <Svg>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    </Svg>
  ),
  poster: (
    <Svg>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="M5 17l5-5 4 4 2-2 3 3" />
    </Svg>
  ),
  fresh: (
    <Svg>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
    </Svg>
  ),
};

export interface MessageActionsProps {
  text: string;
  lang: Lang;
  // आखिरी जवाब पर ही "फिर से लिखें" दिखे
  isLast: boolean;
  busy: boolean;
  onRetry: () => void;
  onBranch: () => void;
  onShorter: () => void;
  onSimpler: () => void;
  onPoster: () => void;
  onNewChat: () => void;
}

// हर Sthamly जवाब के नीचे के बटन: कॉपी, पसंद, नापसंद, भेजें, सुनें और "और" मेन्यू।
export function MessageActions(props: MessageActionsProps) {
  const { text, lang, isLast, busy } = props;
  const t = LABELS[lang].va;
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );

  function flash(msg: string) {
    setToast(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2200);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      flash(t.shareFail);
    }
  }

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    } catch {
      // यूज़र ने खुद बंद कर दिया तो कुछ न दिखाएं
    }
  }

  function listen() {
    if (!("speechSynthesis" in window)) {
      flash(t.shareFail);
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "en" ? "en-IN" : "hi-IN";
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }

  function pick(kind: "up" | "down") {
    const next = vote === kind ? null : kind;
    setVote(next);
    if (next) flash(t.thanks);
  }

  function run(fn: () => void) {
    setMenu(false);
    fn();
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.row} role="toolbar">
        <button type="button" className={styles.btn} onClick={() => void copy()} aria-label={copied ? t.copied : t.copy} title={copied ? t.copied : t.copy}>
          {copied ? ICONS.check : ICONS.copy}
        </button>
        <button type="button" className={`${styles.btn} ${vote === "up" ? styles.on : ""}`} onClick={() => pick("up")} aria-label={t.like} aria-pressed={vote === "up"} title={t.like}>
          {ICONS.like}
        </button>
        <button type="button" className={`${styles.btn} ${vote === "down" ? styles.on : ""}`} onClick={() => pick("down")} aria-label={t.dislike} aria-pressed={vote === "down"} title={t.dislike}>
          {ICONS.dislike}
        </button>
        <button type="button" className={styles.btn} onClick={listen} aria-label={speaking ? t.stopListen : t.listen} title={speaking ? t.stopListen : t.listen}>
          {speaking ? ICONS.stop : ICONS.speaker}
        </button>
        <button type="button" className={styles.btn} onClick={() => void share()} aria-label={t.share} title={t.share}>
          {ICONS.share}
        </button>
        <div className={styles.menuWrap}>
          <button type="button" className={styles.btn} onClick={() => setMenu((v) => !v)} aria-label={t.more} aria-expanded={menu} title={t.more}>
            {ICONS.dots}
          </button>
          {menu && (
            <>
              <div className={styles.scrim} onClick={() => setMenu(false)} />
              <div className={styles.menu} role="menu">
                {isLast && (
                  <button type="button" role="menuitem" className={styles.item} disabled={busy} onClick={() => run(props.onRetry)}>
                    {ICONS.retry}
                    {t.retry}
                  </button>
                )}
                <button type="button" role="menuitem" className={styles.item} disabled={busy} onClick={() => run(props.onShorter)}>
                  {ICONS.shorter}
                  {t.shorter}
                </button>
                <button type="button" role="menuitem" className={styles.item} disabled={busy} onClick={() => run(props.onSimpler)}>
                  {ICONS.simpler}
                  {t.simpler}
                </button>
                <button type="button" role="menuitem" className={styles.item} onClick={() => run(props.onPoster)}>
                  {ICONS.poster}
                  {t.toPoster}
                </button>
                <div className={styles.sep} />
                <button type="button" role="menuitem" className={styles.item} onClick={() => run(props.onBranch)}>
                  {ICONS.branch}
                  {t.branch}
                </button>
                <button type="button" role="menuitem" className={styles.item} onClick={() => run(props.onNewChat)}>
                  {ICONS.fresh}
                  {t.newChat}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {toast && (
        <p className={styles.toast} role="status">
          {toast}
        </p>
      )}
    </div>
  );
}