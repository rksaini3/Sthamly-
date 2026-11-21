// Sthamly AI web: chat ki side bar, ChatGPT jaisi layout.
// Ye sirf dikhata hai. Data aur kaam (naya chat, khholna, hatana, log-out) ChatPage se aate hain.
// Desktop par bayen taraf hamesha khuli. Mobile par overlay: bahar tap ya Esc se band.

import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ConversationSummary } from "../api/client";
import "./ChatSidebar.css";

export type HistoryState = "loading" | "on" | "off";

export interface ChatSidebarProps {
  open: boolean;
  onClose: () => void;
  isGuest: boolean;
  isMember: boolean;
  email: string | null;
  planName: string | null;
  historyState: HistoryState;
  conversations: ConversationSummary[];
  activeId: string | null;
  hasMore: boolean;
  busy: boolean;
  newChatDisabled: boolean;
  onNewChat: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onLoadMore: () => void;
  onSignOut: () => void;
}

interface Group {
  label: string;
  items: ConversationSummary[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Baatein aaj, pichhle 7 din, aur purani mein baant dete hain (ChatGPT ki tarah).
export function groupConversations(
  list: ConversationSummary[],
  now: Date = new Date(),
): Group[] {
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startWeek = startToday - 7 * DAY_MS;

  const today: ConversationSummary[] = [];
  const week: ConversationSummary[] = [];
  const older: ConversationSummary[] = [];

  for (const c of list) {
    const t = Date.parse(c.updated_at);
    if (Number.isNaN(t) || t < startWeek) older.push(c);
    else if (t >= startToday) today.push(c);
    else week.push(c);
  }

  const groups: Group[] = [
    { label: "आज", items: today },
    { label: "पिछले 7 दिन", items: week },
    { label: "पहले", items: older },
  ];
  return groups.filter((g) => g.items.length > 0);
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function ChatSidebar(p: ChatSidebarProps) {
  const { open, onClose } = p;

  // Mobile par Esc dabane se band.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const groups = groupConversations(p.conversations);
  const initial = p.email ? (Array.from(p.email)[0]?.toUpperCase() ?? "?") : "?";

  return (
    <>
      <div
        className={`cs-scrim${open ? " open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={`cs-root${open ? " open" : ""}`} aria-label="बातचीत की सूची">
        <div className="cs-head">
          <div className="cs-brand">
            <span className="cs-logo" aria-hidden="true">
              S
            </span>
            <span>Sthamly</span>
          </div>
          <button
            type="button"
            className="cs-icon-btn cs-mobile-only"
            onClick={onClose}
            aria-label="मेन्यू बंद करें"
          >
            <Icon>
              <path d="M18 6 6 18M6 6l12 12" />
            </Icon>
          </button>
        </div>

        <button
          type="button"
          className="cs-new"
          onClick={p.onNewChat}
          disabled={p.newChatDisabled}
        >
          <Icon>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </Icon>
          <span>नई बातचीत</span>
        </button>

        <div className="cs-scroll">
          {p.isMember && p.historyState === "loading" && (
            <p className="cs-note">लोड हो रहा है…</p>
          )}
          {p.isMember && p.historyState === "off" && (
            <p className="cs-note">इतिहास बंद है। सेटिंग्स में चालू करें।</p>
          )}
          {p.isMember && p.historyState === "on" && groups.length === 0 && (
            <p className="cs-note">अभी कोई बातचीत नहीं है।</p>
          )}
          {p.isGuest && (
            <p className="cs-note">
              मेहमान मोड में बातचीत सेव नहीं होती। लॉग-इन करने पर इतिहास मिलेगा।
            </p>
          )}

          {p.historyState === "on" &&
            groups.map((g) => (
              <section key={g.label} className="cs-group" aria-label={g.label}>
                <p className="cs-label">{g.label}</p>
                <ul className="cs-list">
                  {g.items.map((c) => {
                    const isActive = c.id === p.activeId;
                    return (
                      <li key={c.id} className={`cs-item${isActive ? " active" : ""}`}>
                        <button
                          type="button"
                          className="cs-item-open"
                          onClick={() => p.onOpen(c.id)}
                          disabled={p.busy}
                          aria-current={isActive ? "page" : undefined}
                          title={c.title}
                        >
                          {c.title}
                        </button>
                        <button
                          type="button"
                          className="cs-item-del"
                          onClick={() => p.onDelete(c.id)}
                          disabled={p.busy}
                          aria-label="बातचीत हटाएँ"
                          title="हटाएँ"
                        >
                          <Icon>
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="M19 6l-1 14H6L5 6" />
                          </Icon>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

          {p.historyState === "on" && p.hasMore && (
            <button type="button" className="cs-more" onClick={p.onLoadMore}>
              और देखें
            </button>
          )}
        </div>

        <div className="cs-foot">
          <Link to="/create" className="cs-link" onClick={onClose}>
            <Icon>
              <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
            </Icon>
            <span>बनाएँ</span>
          </Link>

          {p.isMember ? (
            <>
              <Link to="/usage" className="cs-link" onClick={onClose}>
                <Icon>
                  <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
                </Icon>
                <span>उपयोग</span>
              </Link>
              <Link to="/settings" className="cs-link" onClick={onClose}>
                <Icon>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
                </Icon>
                <span>सेटिंग्स</span>
              </Link>

              <div className="cs-user">
                <span className="cs-avatar" aria-hidden="true">
                  {initial}
                </span>
                <div className="cs-user-text">
                  <span className="cs-email">{p.email ?? "लॉग-इन"}</span>
                  {p.planName && <span className="cs-plan">{p.planName}</span>}
                </div>
                <button
                  type="button"
                  className="cs-icon-btn"
                  onClick={p.onSignOut}
                  aria-label="लॉग-आउट"
                  title="लॉग-आउट"
                >
                  <Icon>
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <path d="M16 17l5-5-5-5" />
                    <path d="M21 12H9" />
                  </Icon>
                </button>
              </div>
            </>
          ) : (
            <Link to="/login" className="cs-login" onClick={onClose}>
              लॉग-इन करें
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
