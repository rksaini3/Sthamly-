"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import styles from "@/components/nav/AppDrawer.module.css";
import { LangSwitch } from "@/components/nav/LangSwitch";
import type { ChatSummary } from "@/lib/chats";
import type { Lang } from "@/lib/i18n";
import { LABELS, type Labels } from "@/lib/labels";

// ☰ इन पन्नों पर नहीं दिखेगा (लॉगिन, कानूनी पन्ने और पूरी स्क्रीन वाला लाइव कैमरा)
const HIDDEN_PREFIXES = ["/login", "/auth", "/privacy", "/terms", "/live"] as const;

type IconName =
  | "new"
  | "notebook"
  | "library"
  | "images"
  | "batch"
  | "feed"
  | "shop"
  | "pin"
  | "trash"
  | "customize"
  | "projects"
  | "scheduled"
  | "plugins"
  | "staff"
  | "pencil"
  | "live"
  | "search"
  | "globe";

// साइडबार में केवल ज़रूरी चीज़ें; बाकी प्रोफ़ाइल पर हैं
type ItemKey = "live" | "gallery" | "saved" | "notes";

interface DrawerItem {
  href: string;
  key: ItemKey;
  icon: IconName;
}

// ड्रॉअर की सूची। नाम छोटे हैं और lib/labels.ts से दोनों भाषाओं में आते हैं।
// "जल्द आएगा" वाले पन्ने /soon/... पर खुलते हैं।
const ITEMS: DrawerItem[] = [
  { href: "/live", key: "live", icon: "live" },
  { href: "/images", key: "gallery", icon: "images" },
  { href: "/my-posters", key: "saved", icon: "library" },
  { href: "/notebook", key: "notes", icon: "notebook" },
];

// तारीख़ के हिसाब से समूह: आज, कल, पिछले 7 दिन, पुराना
type Group = "today" | "yesterday" | "week" | "older";
const GROUP_ORDER: Group[] = ["today", "yesterday", "week", "older"];

function groupOf(iso: string): Group {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 24 * 60 * 60 * 1000;
  const t = d.getTime();
  if (t >= startToday) return "today";
  if (t >= startToday - day) return "yesterday";
  if (t >= startToday - 7 * day) return "week";
  return "older";
}

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// साफ़ और सादे आइकन (सब एक ही मोटाई की लाइन में)
const PATHS: Record<IconName, string[]> = {
  new: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"],
  notebook: ["M6 3h11a1 1 0 011 1v16a1 1 0 01-1 1H6z", "M6 3v18", "M10 8h5M10 12h5"],
  library: ["M4 5h4v14H4z", "M10 5h4v14h-4z", "M16.5 6l3.7 1-3 12-3.7-1z"],
  images: ["M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z", "M3 16l5-5 4 4 3-3 6 6", "M9 9.5h.01"],
  batch: ["M12 3l9 5-9 5-9-5z", "M3 13l9 5 9-5"],
  feed: ["M3 11v2a1 1 0 001 1h2l7 4V6L6 10H4a1 1 0 00-1 1z", "M17 9a4 4 0 010 6"],
  shop: ["M4 9l1-5h14l1 5", "M4 9a2.5 2.5 0 005 0 2.5 2.5 0 005 0 2.5 2.5 0 005 0", "M5 12v8h14v-8", "M10 20v-5h4v5"],
  pin: ["M9 4h6l-1 6 3 3H7l3-3z", "M12 13v7"],
  trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13"],
  customize: ["M4 7h9", "M17 7h3", "M4 17h3", "M11 17h9", "M13 5v4h4V5z", "M7 15v4h4v-4z"],
  projects: ["M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"],
  scheduled: ["M12 3a9 9 0 100 18 9 9 0 000-18z", "M12 7v5l3 2"],
  plugins: ["M9 3v4M15 3v4", "M6 7h12v4a6 6 0 01-12 0z", "M12 17v4"],
  search: ["M11 4a7 7 0 100 14 7 7 0 000-14z", "M20 20l-4-4"],
  globe: ["M12 3a9 9 0 100 18 9 9 0 000-18z", "M3 12h18", "M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"],
  staff: ["M16 11a3 3 0 100-6 3 3 0 000 6z", "M8 12a3 3 0 100-6 3 3 0 000 6z", "M2 20c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5", "M14.5 15.7c.5-.2 1-.2 1.5-.2 2.8 0 5.2 1.5 6 4.5"],
  pencil: ["M4 20l1-4L17 4l3 3L8 19z"],
  live: ["M3 7a2 2 0 012-2h9a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z", "M16 10l5-3v10l-5-3"],
};

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
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
      aria-hidden
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8h16M4 16h10" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
    </svg>
  );
}

export function AppDrawer({ lang = "hi" }: { lang?: Lang }) {
  const t: Labels["nav"] = LABELS[lang].nav;
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // null = अभी नहीं आया या लॉग-इन नहीं है (तब बातचीत की सूची नहीं दिखती)
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  // ऊपर की खोज: बातचीत के नाम से छाँटना
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  // इतिहास का हिस्सा हमेशा दिखे: लोड हो रहा / लॉग-इन चाहिए / गड़बड़ / ठीक
  const [historyState, setHistoryState] = useState<"loading" | "login" | "error" | "ok">("loading");

  const loadChats = useCallback(async () => {
    try {
      const res = await fetch("/api/chats", { cache: "no-store" });
      if (res.status === 401) {
        setChats(null);
        setHistoryState("login");
        return;
      }
      if (!res.ok) {
        setChats(null);
        setHistoryState("error");
        return;
      }
      const data = (await res.json()) as { chats: ChatSummary[] };
      setChats(data.chats);
      setHistoryState("ok");
    } catch {
      // इतिहास न आए तो भी बाकी मेन्यू चले
      setChats(null);
      setHistoryState("error");
    }
  }, []);

  // Escape से बंद करें और खुले मेन्यू के पीछे का पन्ना न सरके
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  // हर बार मेन्यू खुलने पर ताज़ा सूची, और कौन-सी चैट खुली है
  useEffect(() => {
    if (!open) return;
    setChatError(null);
    setSearching(false);
    setQuery("");
    setActiveChat(new URLSearchParams(window.location.search).get("chat"));
    void loadChats();
  }, [open, loadChats]);

  if (HIDDEN_PREFIXES.some((p) => matches(pathname, p))) return null;

  function close() {
    setOpen(false);
  }

  function startNew() {
    close();
    // हर बार नया मान, ताकि चैट पन्ना नए सिरे से खुले
    router.push(`/voice?n=${Date.now()}`);
  }

  async function togglePin(chat: ChatSummary) {
    setChatError(null);
    const next = !chat.pinned;
    // पहले स्क्रीन पर बदलें, फेल हो तो वापस
    setChats((list) => list?.map((c) => (c.id === chat.id ? { ...c, pinned: next } : c)) ?? list);
    try {
      const res = await fetch(`/api/chats/${chat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: next }),
      });
      if (!res.ok) throw new Error("pin failed");
    } catch {
      setChats((list) => list?.map((c) => (c.id === chat.id ? { ...c, pinned: chat.pinned } : c)) ?? list);
      setChatError(t.errPin);
    }
  }

  // नाम बदलना (नया नाम सर्वर पर भी सेव होता है)
  async function renameChat(chat: ChatSummary) {
    const input = window.prompt(t.renamePrompt, chat.title);
    const title = input?.trim();
    if (!title || title === chat.title) return;
    setChatError(null);
    try {
      const res = await fetch(`/api/chats/${chat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.slice(0, 80) }),
      });
      if (!res.ok) throw new Error("rename failed");
      setChats((list) => list?.map((c) => (c.id === chat.id ? { ...c, title: title.slice(0, 80) } : c)) ?? list);
    } catch {
      setChatError(t.errRename);
    }
  }

  async function removeChat(chat: ChatSummary) {
    if (!window.confirm(t.removeConfirm)) return;
    setChatError(null);
    try {
      const res = await fetch(`/api/chats/${chat.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error("delete failed");
      setChats((list) => list?.filter((c) => c.id !== chat.id) ?? list);
      // जो चैट अभी खुली है वही हटी तो खाली नई चैट खोलें
      if (activeChat === chat.id) startNew();
    } catch {
      setChatError(t.errRemove);
    }
  }

  function chatRow(chat: ChatSummary) {
    const isActive = activeChat === chat.id && matches(pathname, "/voice");
    return (
      <div key={chat.id} className={`${styles.chatRow} ${isActive ? styles.chatActive : ""}`}>
        <Link
          href={`/voice?chat=${chat.id}`}
          className={styles.chatLink}
          aria-current={isActive ? "page" : undefined}
          onClick={close}
        >
          {chat.title}
        </Link>
        <button
          type="button"
          className={`${styles.chatAct} ${chat.pinned ? styles.pinnedOn : ""}`}
          aria-label={chat.pinned ? t.unpin : t.pin}
          aria-pressed={chat.pinned}
          onClick={() => void togglePin(chat)}
        >
          <Icon name="pin" size={18} />
        </button>
        <button
          type="button"
          className={styles.chatAct}
          aria-label={t.rename}
          onClick={() => void renameChat(chat)}
        >
          <Icon name="pencil" size={18} />
        </button>
        <button
          type="button"
          className={styles.chatAct}
          aria-label={t.remove}
          onClick={() => void removeChat(chat)}
        >
          <Icon name="trash" size={18} />
        </button>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const shown = q ? (chats ?? []).filter((c) => c.title.toLowerCase().includes(q)) : (chats ?? []);
  const pinned = shown.filter((c) => c.pinned);
  const recent = shown.filter((c) => !c.pinned);

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label={t.menuOpen}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <MenuIcon />
      </button>

      {open && (
        <div className={styles.overlay} onClick={close}>
          <aside
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label={t.menu}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.head}>
              <strong>{t.brand}</strong>
              <div className={styles.headActions}>
                <button
                  type="button"
                  className={styles.searchBtn}
                  aria-label={t.find}
                  aria-expanded={searching}
                  onClick={() => {
                    setSearching((v) => !v);
                    setQuery("");
                  }}
                >
                  <Icon name="search" size={20} />
                </button>
              </div>
            </div>

            {searching && (
              <input
                className={styles.searchInput}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.findHint}
                aria-label={t.find}
                autoFocus
              />
            )}

            <div className={styles.scroll}>
              <nav className={styles.list} aria-label={t.mainList}>
                {ITEMS.map((item) => {
                  const active = matches(pathname, item.href);
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className={`${styles.link} ${active ? styles.active : ""}`}
                      aria-current={active ? "page" : undefined}
                      onClick={close}
                    >
                      <Icon name={item.icon} />
                      {t[item.key]}
                    </Link>
                  );
                })}
                {/* भाषा: बाकी सूची जैसी ही पंक्ति, दाईं ओर हिं | EN */}
                <div className={styles.link} style={{ justifyContent: "space-between", cursor: "default" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
                    <Icon name="globe" />
                    {t.language}
                  </span>
                  <LangSwitch lang={lang} label={t.language} />
                </div>
              </nav>

              {/* पिन की हुई और हाल की बातचीत (लॉग-इन होने पर) */}
              <div className={styles.history}>
                <p className={styles.sectionTitle}>{t.starred}</p>
                {historyState === "ok" && !q && pinned.length === 0 && (
                  <p className={styles.empty}>{t.pinHint}</p>
                )}
                {pinned.map(chatRow)}

                <p className={styles.sectionTitle}>{t.recent}</p>
                {historyState === "loading" && <p className={styles.empty}>{t.loading}</p>}
                {historyState === "login" && (
                  <p className={styles.empty}>
                    {t.loginPre}
                    <Link href="/login?next=/voice" onClick={close} style={{ color: "var(--accent)", fontWeight: 600 }}>
                      {t.loginLink}
                    </Link>
                    {t.loginPost}
                  </p>
                )}
                {historyState === "error" && (
                  <p className={styles.empty}>
                    {t.historyError}
                  </p>
                )}
                {historyState === "ok" && q && recent.length === 0 && pinned.length === 0 && (
                  <p className={styles.empty}>{t.noMatch}</p>
                )}
                {historyState === "ok" && !q && recent.length === 0 && pinned.length === 0 && (
                  <p className={styles.empty}>{t.noChats}</p>
                )}
                {GROUP_ORDER.map((g) => {
                  const rows = recent.filter((c) => groupOf(c.updated_at) === g);
                  if (rows.length === 0) return null;
                  return (
                    <div key={g}>
                      <p className={styles.sectionTitle} style={{ fontWeight: 500, marginTop: 10 }}>
                        {t[g]}
                      </p>
                      {rows.map(chatRow)}
                    </div>
                  );
                })}

                {chatError && (
                  <p role="alert" className={styles.empty} style={{ color: "var(--danger)" }}>
                    {chatError}
                  </p>
                )}
              </div>
            </div>

            {/* नीचे (ChatGPT जैसा): बाईं ओर नीला "चैट" बटन, दाईं ओर प्रोफ़ाइल का गोला */}
            <div className={styles.footer}>
              <button type="button" className={styles.newPill} onClick={startNew}>
                <Icon name="new" size={20} />
                {lang === "en" ? "Chat" : "चैट"}
              </button>
              <Link href="/account" className={styles.avatar} aria-label={t.account} onClick={close}>
                <UserIcon />
              </Link>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

export default AppDrawer;