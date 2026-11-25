// Sthamly AI web: chat ki side bar, ChatGPT jaisi structure.
// Upar: brand, search, naya chat. Beech: pinned, phir date ke hisaab se baatein.
// Neeche: sirf ek profile card. Plan, bhasha, usage, settings aur logout sab profile menu mein.
// Pin abhi is browser mein save hote hain (localStorage). Server par jaane ka kaam baad mein.
// Desktop par bayen taraf hamesha khuli. Mobile par overlay: bahar tap ya Esc se band.

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ConversationSummary } from "../api/client";
import { LANGUAGE_OPTIONS, findLanguage } from "../lib/languages";
import "./ChatSidebar.css";
import "./ChatSidebarExtras.css";

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
  currentLang: string;
  onLanguage: (code: string) => void;
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
const PIN_KEY = "sthamly_pins";

// Pin ki ids is browser mein. Storage band ho to sirf is session mein rehte hain.
function readPins(): string[] {
  try {
    const raw = window.localStorage.getItem(PIN_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writePins(ids: string[]): void {
  try {
    window.localStorage.setItem(PIN_KEY, JSON.stringify(ids));
  } catch {
    // Storage nahi chal rahi: state is session mein already badal chuka hai.
  }
}

// Baatein: aaj, pichhle 7 din, pichhle 30 din, aur pehle (ChatGPT ki tarah).
export function groupConversations(
  list: ConversationSummary[],
  now: Date = new Date(),
): Group[] {
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const start7 = startToday - 7 * DAY_MS;
  const start30 = startToday - 30 * DAY_MS;

  const today: ConversationSummary[] = [];
  const week: ConversationSummary[] = [];
  const month: ConversationSummary[] = [];
  const older: ConversationSummary[] = [];

  for (const c of list) {
    const t = Date.parse(c.updated_at);
    if (Number.isNaN(t) || t < start30) older.push(c);
    else if (t >= startToday) today.push(c);
    else if (t >= start7) week.push(c);
    else month.push(c);
  }

  const groups: Group[] = [
    { label: "आज", items: today },
    { label: "पिछले 7 दिन", items: week },
    { label: "पिछले 30 दिन", items: month },
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [pins, setPins] = useState<string[]>(() => readPins());

  // Mobile par Esc dabane se band.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function closeMenu(): void {
    setMenuOpen(false);
    setLangOpen(false);
  }

  function togglePin(id: string): void {
    const next = pins.includes(id) ? pins.filter((x) => x !== id) : [id, ...pins];
    setPins(next);
    writePins(next);
  }

  const q = query.trim().toLowerCase();
  const matched = q.length > 0
    ? p.conversations.filter((c) => c.title.toLowerCase().includes(q))
    : p.conversations;

  // Pinned pehle, us ka order pin karne ke waqt wala. Jo pinned hain wo neeche ke groups mein nahi dikhte.
  const pinned: ConversationSummary[] = [];
  for (const id of pins) {
    const found = matched.find((c) => c.id === id);
    if (found) pinned.push(found);
  }
  const groups = groupConversations(matched.filter((c) => !pins.includes(c.id)));
  const nothingShown = pinned.length === 0 && groups.length === 0;

  const currentLabel = findLanguage(p.currentLang)?.label ?? "हिन्दी";
  const initial = p.email ? (Array.from(p.email)[0]?.toUpperCase() ?? "?") : "?";

  function renderItem(c: ConversationSummary) {
    const isActive = c.id === p.activeId;
    const pinOn = pins.includes(c.id);
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
          className={`cs-item-act${pinOn ? " on" : ""}`}
          onClick={() => togglePin(c.id)}
          aria-pressed={pinOn}
          aria-label={pinOn ? "पिन हटाएँ" : "पिन करें"}
          title={pinOn ? "पिन हटाएँ" : "पिन करें"}
        >
          <Icon>
            <path d="M12 17v5" />
            <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z" />
          </Icon>
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
  }

  return (
    <>
      <div className={`cs-scrim${open ? " open" : ""}`} onClick={onClose} aria-hidden="true" />

      <aside className={`cs-root${open ? " open" : ""}`} aria-label="साइड बार">
        {/* Upar: brand aur icons */}
        <div className="cs-head">
          <div className="cs-brand">
            <span className="cs-logo" aria-hidden="true">
              S
            </span>
            <span>Sthamly</span>
          </div>
          <div className="cs-head-actions">
            <button
              type="button"
              className="cs-icon-btn"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="बातचीत खोजें"
              aria-pressed={searchOpen}
              title="खोजें"
            >
              <Icon>
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </Icon>
            </button>
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
        </div>

        {/* Naya chat, banane ka link, khoj */}
        <div className="cs-top">
          <button
            type="button"
            className="cs-nav-btn"
            onClick={p.onNewChat}
            disabled={p.newChatDisabled}
          >
            <Icon>
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </Icon>
            <span>नई बातचीत</span>
          </button>

          <Link to="/create" className="cs-nav-btn" onClick={onClose}>
            <Icon>
              <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
            </Icon>
            <span>बनाएँ</span>
          </Link>

          {/* Kaam ki cheezein: pehle "जल्द" hain, page baad mein jude ga. */}
          <button type="button" className="cs-nav-btn" disabled title="जल्द आएगा">
            <Icon>
              <path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6.5A2.5 2.5 0 0 0 4 19.5z" />
              <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20" />
            </Icon>
            <span>मेरी नोटबुक</span>
            <span className="cs-soon">जल्द</span>
          </button>

          <button type="button" className="cs-nav-btn" disabled title="जल्द आएगा">
            <Icon>
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="9" cy="9" r="2" />
              <path d="M21 15l-5-5L5 21" />
            </Icon>
            <span>मेरी गैलरी</span>
            <span className="cs-soon">जल्द</span>
          </button>

          <button type="button" className="cs-nav-btn" disabled title="जल्द आएगा">
            <Icon>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
              <path d="M12 14v3l2 1" />
            </Icon>
            <span>शेड्यूल</span>
            <span className="cs-soon">जल्द</span>
          </button>

          {searchOpen && (
            <input
              type="search"
              className="cs-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="बातचीत खोजें…"
              aria-label="बातचीत खोजें"
              autoFocus
            />
          )}
        </div>

        {/* Beech: pinned, phir baatein */}
        <div className="cs-scroll">
          {p.isMember && p.historyState === "loading" && <p className="cs-note">लोड हो रहा है…</p>}
          {p.isMember && p.historyState === "off" && (
            <p className="cs-note">इतिहास बंद है। सेटिंग्स में चालू करें।</p>
          )}
          {p.historyState === "on" && nothingShown && (
            <p className="cs-note">{q.length > 0 ? "कोई बातचीत नहीं मिली।" : "अभी कोई बातचीत नहीं है।"}</p>
          )}
          {p.isGuest && (
            <p className="cs-note">
              मेहमान मोड में बातचीत सेव नहीं होती। लॉग-इन करने पर इतिहास मिलेगा।
            </p>
          )}

          {p.historyState === "on" && pinned.length > 0 && (
            <section className="cs-group" aria-label="पिन की गई बातें">
              <p className="cs-label">पिन की गई</p>
              <ul className="cs-list">{pinned.map((c) => renderItem(c))}</ul>
            </section>
          )}

          {p.historyState === "on" &&
            groups.map((g) => (
              <section key={g.label} className="cs-group" aria-label={g.label}>
                <p className="cs-label">{g.label}</p>
                <ul className="cs-list">{g.items.map((c) => renderItem(c))}</ul>
              </section>
            ))}

          {p.historyState === "on" && p.hasMore && q.length === 0 && (
            <button type="button" className="cs-more" onClick={p.onLoadMore}>
              और देखें
            </button>
          )}
        </div>

        {/* Neeche: sirf profile. Baaki sab menu ke andar. */}
        <div className="cs-foot">
          <div className="cs-menu-wrap">
            {menuOpen && (
              <div className="cs-menu" role="menu" aria-label="प्रोफ़ाइल मेन्यू">
                <Link
                  to="/plans"
                  role="menuitem"
                  className="cs-menu-item"
                  onClick={() => {
                    closeMenu();
                    onClose();
                  }}
                >
                  <Icon>
                    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
                  </Icon>
                  <span className="cs-menu-label">प्लान और टॉपअप</span>
                  <span className="cs-menu-value">{p.planName ?? "फ़्री"}</span>
                </Link>

                <button
                  type="button"
                  role="menuitem"
                  className="cs-menu-item"
                  onClick={() => setLangOpen((v) => !v)}
                  aria-expanded={langOpen}
                  aria-controls="cs-lang-list"
                >
                  <Icon>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18" />
                    <path d="M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
                  </Icon>
                  <span className="cs-menu-label">भाषा</span>
                  <span className="cs-menu-value">{currentLabel}</span>
                </button>

                {langOpen && (
                  <ul id="cs-lang-list" className="cs-lang-list" role="listbox" aria-label="भाषा चुनें">
                    {LANGUAGE_OPTIONS.map((o) => {
                      const selected = o.code === p.currentLang;
                      return (
                        <li key={o.code}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={selected}
                            className={`cs-lang-item${selected ? " selected" : ""}`}
                            disabled={!o.supported}
                            onClick={() => {
                              p.onLanguage(o.code);
                              closeMenu();
                            }}
                          >
                            <span className="cs-lang-text">
                              <span className="cs-lang-name">{o.label}</span>
                              <span className="cs-lang-en">{o.english}</span>
                            </span>
                            {!o.supported && <span className="cs-soon">जल्द</span>}
                            {selected && o.supported && <span className="cs-check" aria-hidden="true">✓</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {p.isMember && (
                  <Link
                    to="/usage"
                    role="menuitem"
                    className="cs-menu-item"
                    onClick={() => {
                      closeMenu();
                      onClose();
                    }}
                  >
                    <Icon>
                      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
                    </Icon>
                    <span className="cs-menu-label">उपयोग</span>
                  </Link>
                )}

                {p.isMember && (
                  <Link
                    to="/settings"
                    role="menuitem"
                    className="cs-menu-item"
                    onClick={() => {
                      closeMenu();
                      onClose();
                    }}
                  >
                    <Icon>
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
                    </Icon>
                    <span className="cs-menu-label">सेटिंग्स</span>
                  </Link>
                )}

                <button type="button" role="menuitem" className="cs-menu-item" disabled title="जल्द आएगा">
                  <Icon>
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1" />
                  </Icon>
                  <span className="cs-menu-label">मेरा QR और रेफरल</span>
                  <span className="cs-soon">जल्द</span>
                </button>

                <div className="cs-menu-sep" aria-hidden="true" />

                {p.isMember ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="cs-menu-item danger"
                    onClick={() => {
                      closeMenu();
                      p.onSignOut();
                    }}
                  >
                    <Icon>
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <path d="M16 17l5-5-5-5" />
                      <path d="M21 12H9" />
                    </Icon>
                    <span className="cs-menu-label">लॉग-आउट</span>
                  </button>
                ) : (
                  <Link
                    to="/login"
                    role="menuitem"
                    className="cs-menu-item"
                    onClick={() => {
                      closeMenu();
                      onClose();
                    }}
                  >
                    <span className="cs-menu-label">लॉग-इन करें</span>
                  </Link>
                )}
              </div>
            )}

            <button
              type="button"
              className="cs-user-btn"
              onClick={() => {
                if (menuOpen) closeMenu();
                else setMenuOpen(true);
              }}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="cs-avatar" aria-hidden="true">
                {p.isMember ? initial : "?"}
              </span>
              <span className="cs-user-text">
                <span className="cs-email">{p.isMember ? (p.email ?? "लॉग-इन") : "मेहमान"}</span>
                <span className="cs-plan-name">{p.isMember ? (p.planName ?? "फ़्री") : "लॉग-इन करें"}</span>
              </span>
              <span className="cs-chevron" aria-hidden="true">
                {menuOpen ? "⌄" : "⌃"}
              </span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}