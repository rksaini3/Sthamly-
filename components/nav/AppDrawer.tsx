"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import styles from "@/components/nav/AppDrawer.module.css";
import type { ChatSummary } from "@/lib/chats";

// ☰ इन पन्नों पर नहीं दिखेगा (लॉगिन और कानूनी पन्ने)
const HIDDEN_PREFIXES = ["/login", "/auth", "/privacy", "/terms"] as const;

type IconName = "new" | "notebook" | "library" | "images" | "batch" | "feed" | "shop" | "pin" | "trash";

interface DrawerItem {
  href: string;
  label: string;
  icon: IconName;
}

// ड्रॉअर की सूची। "नया काम" ऊपर अलग बटन है। "खोज" v1 में नहीं है।
// नोटबुक = ऑफ़र और उनसे बने पोस्टर, मेरे बनाए = लाइब्रेरी, इमेज = सिर्फ़ तस्वीरें।
const ITEMS: DrawerItem[] = [
  { href: "/notebook", label: "नोटबुक", icon: "notebook" },
  { href: "/my-posters", label: "मेरे बनाए", icon: "library" },
  { href: "/images", label: "इमेज", icon: "images" },
  { href: "/batch", label: "बैच", icon: "batch" },
  { href: "/feed", label: "घोषणा", icon: "feed" },
  { href: "/account", label: "दुकान की जानकारी", icon: "shop" },
];

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

function CloseIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
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

function BellIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <path d="M10 19a2 2 0 004 0" />
    </svg>
  );
}

export function AppDrawer() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // null = अभी नहीं आया या लॉग-इन नहीं है (तब बातचीत की सूची नहीं दिखती)
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);

  const loadChats = useCallback(async () => {
    try {
      const res = await fetch("/api/chats", { cache: "no-store" });
      if (!res.ok) {
        setChats(null);
        return;
      }
      const data = (await res.json()) as { chats: ChatSummary[] };
      setChats(data.chats);
    } catch {
      // इतिहास न आए तो भी बाकी मेन्यू चले
      setChats(null);
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
      setChatError("पिन नहीं हो पाया, दोबारा कोशिश करें।");
    }
  }

  async function removeChat(chat: ChatSummary) {
    if (!window.confirm("इस बातचीत को हमेशा के लिए हटाएं?")) return;
    setChatError(null);
    try {
      const res = await fetch(`/api/chats/${chat.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error("delete failed");
      setChats((list) => list?.filter((c) => c.id !== chat.id) ?? list);
      // जो चैट अभी खुली है वही हटी तो खाली नई चैट खोलें
      if (activeChat === chat.id) startNew();
    } catch {
      setChatError("हटाया नहीं जा सका, दोबारा कोशिश करें।");
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
          aria-label={chat.pinned ? "पिन हटाएं" : "पिन करें"}
          aria-pressed={chat.pinned}
          onClick={() => void togglePin(chat)}
        >
          <Icon name="pin" size={18} />
        </button>
        <button
          type="button"
          className={styles.chatAct}
          aria-label="बातचीत हटाएं"
          onClick={() => void removeChat(chat)}
        >
          <Icon name="trash" size={18} />
        </button>
      </div>
    );
  }

  const pinned = chats?.filter((c) => c.pinned) ?? [];
  const recent = chats?.filter((c) => !c.pinned) ?? [];

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label="मेन्यू खोलें"
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
            aria-label="मेन्यू"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.head}>
              <strong>Sthamly</strong>
              <button type="button" className={styles.close} aria-label="मेन्यू बंद करें" onClick={close}>
                <CloseIcon />
              </button>
            </div>

            <button type="button" className={styles.newBtn} onClick={startNew}>
              <Icon name="new" />
              नया काम
            </button>

            <nav className={styles.list} aria-label="मुख्य सूची">
              {ITEMS.map((item) => {
                const active = matches(pathname, item.href);
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`${styles.link} ${active ? styles.active : ""}`}
                    aria-current={active ? "page" : undefined}
                    onClick={close}
                  >
                    <Icon name={item.icon} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* पिन की हुई और हाल की बातचीत (लॉग-इन होने पर) */}
            {chats !== null && (
              <div className={styles.history}>
                {pinned.length > 0 && (
                  <>
                    <p className={styles.sectionTitle}>पिन की हुई</p>
                    {pinned.map(chatRow)}
                  </>
                )}

                <p className={styles.sectionTitle}>हाल की बातचीत</p>
                {recent.length === 0 && pinned.length === 0 && (
                  <p className={styles.empty}>अभी कोई बातचीत नहीं।</p>
                )}
                {recent.map(chatRow)}

                {chatError && (
                  <p role="alert" className={styles.empty} style={{ color: "var(--danger)" }}>
                    {chatError}
                  </p>
                )}
              </div>
            )}

            {/* नीचे: खाता (प्रोफ़ाइल का गोला) और घंटी */}
            <div className={styles.footer}>
              <Link href="/account" className={styles.avatar} aria-label="खाता" onClick={close}>
                <UserIcon />
              </Link>
              <Link href="/notifications" className={styles.bell} aria-label="सूचनाएं" onClick={close}>
                <BellIcon />
              </Link>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

export default AppDrawer;