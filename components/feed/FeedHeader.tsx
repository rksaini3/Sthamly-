import Link from "next/link";
import styles from "@/components/feed/FeedHeader.module.css";

// ☰ बाईं ओर (ड्रॉअर), दाईं ओर घंटी (सूचनाएं) जिस पर नई सूचनाओं की गिनती दिखती है।
export interface FeedHeaderProps {
  initial: string;
  loggedIn: boolean;
  unread?: number;
}

export function FeedHeader({ loggedIn, unread = 0 }: FeedHeaderProps) {
  return (
    <header className={styles.wrap}>
      <div className={styles.top}>
        <span aria-hidden className={styles.spacer} />
        <span className={styles.title}>घोषणा</span>

        {loggedIn ? (
          <Link
            href="/notifications"
            aria-label={unread > 0 ? `सूचनाएं, ${unread} नई` : "सूचनाएं"}
            style={{
              justifySelf: "end",
              position: "relative",
              width: 40,
              height: 40,
              display: "grid",
              placeItems: "center",
              fontSize: 20,
              color: "inherit",
              textDecoration: "none",
            }}
          >
            <span aria-hidden>🔔</span>
            {unread > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  minWidth: 18,
                  height: 18,
                  padding: "0 4px",
                  borderRadius: 999,
                  background: "var(--accent)",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
        ) : (
          <span aria-hidden className={styles.spacer} />
        )}
      </div>
    </header>
  );
}