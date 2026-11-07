import Link from "next/link";
import styles from "@/components/feed/FeedHeader.module.css";

export function FeedHeader({
  initial,
  loggedIn,
}: {
  initial: string;
  loggedIn: boolean;
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

        <Link href="/pricing" className={styles.pill}>
          प्लान
        </Link>
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