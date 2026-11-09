import Image from "next/image";
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

        <Link href="/feed" aria-label="Sthamly फ़ीड" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", color: "inherit" }}>
          <Image src="/logo.png" alt="Sthamly" width={32} height={32} priority style={{ borderRadius: 9 }} />
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em" }}>Sthamly</span>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 36, justifyContent: "flex-end" }}>
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