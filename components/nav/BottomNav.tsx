"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import styles from "@/components/nav/BottomNav.module.css";

// बार सिर्फ इन्हीं पन्नों पर दिखेगा
const VISIBLE_ON = [
  "/feed",
  "/onboarding",
  "/my-posters",
  "/announce",
  "/account",
  "/pricing",
  "/voice",
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function OutputIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 5h16M4 10h16M4 15h10M4 20h7" strokeLinecap="round" />
    </svg>
  );
}

function PostIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" strokeLinecap="round" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function TabLink({
  href,
  label,
  active,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`${styles.item} ${active ? styles.itemActive : ""}`}
      aria-current={active ? "page" : undefined}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  const visible = VISIBLE_ON.some((p) => isActive(pathname, p));
  if (!visible) return null;

  const onVoice = isActive(pathname, "/voice");

  return (
    <>
      <div className={styles.spacer} aria-hidden />

      <nav className={styles.nav} aria-label="मुख्य मेनू">
        <TabLink href="/feed" label="आउटपुट" active={isActive(pathname, "/feed")} icon={<OutputIcon />} />
        <TabLink href="/my-posters" label="पोस्ट" active={isActive(pathname, "/my-posters")} icon={<PostIcon />} />

        {/* बीच में माइक: बार का हिस्सा है, अलग से तैरता नहीं */}
        <div className={styles.micSlot}>
          <Link
            href="/voice"
            className={`${styles.mic} ${onVoice ? styles.micActive : ""}`}
            aria-label="बोलकर पोस्टर बनाएं"
            aria-current={onVoice ? "page" : undefined}
          >
            <MicIcon />
          </Link>
          <span className={`${styles.micLabel} ${onVoice ? styles.itemActive : ""}`}>बोलें</span>
        </div>

        <TabLink href="/account" label="खाता" active={isActive(pathname, "/account")} icon={<UserIcon />} />
      </nav>
    </>
  );
}

export default BottomNav;