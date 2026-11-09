import Link from "next/link";
import type { CSSProperties } from "react";
import styles from "@/components/feed/FeedHeader.module.css";

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

const iconButton: CSSProperties = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  borderRadius: "50%",
  color: "inherit",
  textDecoration: "none",
};

export function FeedHeader({
  initial,
  loggedIn,
  unread = 0,
}: {
  initial: string;
  loggedIn: boolean;
  unread?: number;
}) {
  return (
    <header className={styles.wrap}>
      <div className={styles.top}>
        {loggedIn ? (
          <Link href="/account" className={styles.avatar} aria-label="खाता खोलें">
            {initial}
          </Link>
        ) : (
          <Link href="/login?next=/feed" className={styles.avatarGuest} aria-label="लॉग-इन करें">
            ?
          </Link>
        )}

        <span className={styles.logo}>Sthamly</span>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {loggedIn && (
            <Link href="/notifications" style={iconButton} aria-label="सूचनाएं देखें">
              <BellIcon />
              {unread > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    minWidth: 17,
                    height: 17,
                    padding: "0 4px",
                    borderRadius: 999,
                    background: "var(--accent, #e0561a)",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: "17px",
                    textAlign: "center",
                  }}
                >
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          )}

          {loggedIn && (
            <Link href="/settings" style={iconButton} aria-label="सेटिंग्स खोलें">
              <GearIcon />
            </Link>
          )}

          <Link href="/pricing" className={styles.pill}>
            प्लान
          </Link>
        </div>
      </div>

      <nav className={styles.tabs} aria-label="फ़ीड टैब">
        <Link href="/feed" className={`${styles.tab} ${styles.tabActive}`} aria-current="page">
          सब दुकानें
        </Link>
        <Link href="/my-posters" className={styles.tab}>
          मेरे पोस्ट
        </Link>
      </nav>
    </header>
  );
}