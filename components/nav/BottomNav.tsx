"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./BottomNav.module.css";

// नेवबार सिर्फ इन्हीं पन्नों पर दिखेगा (landing और login पर नहीं)
const APP_PREFIXES = ["/dashboard", "/onboarding", "/pricing"];

function isAppRoute(pathname: string): boolean {
  return APP_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function OutputsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function PlanIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  if (!isAppRoute(pathname)) return null;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* नेवबार के नीचे की जगह, ताकि पेज का आखिरी हिस्सा उसके पीछे न छिपे */}
      <div className={styles.spacer} aria-hidden />

      <nav className={styles.nav} aria-label="मुख्य मेनू">
        <Link
          href="/dashboard"
          className={`${styles.item} ${isActive("/dashboard") ? styles.itemActive : ""}`}
          aria-current={isActive("/dashboard") ? "page" : undefined}
        >
          <OutputsIcon />
          <span>आउटपुट</span>
        </Link>

        <Link
          href="/onboarding"
          className={styles.center}
          aria-label="नया पोस्टर बनाएं"
          aria-current={isActive("/onboarding") ? "page" : undefined}
        >
          <span className={styles.brandMark}>SPG</span>
          <span>नया पोस्टर</span>
        </Link>

        <Link
          href="/pricing"
          className={`${styles.item} ${isActive("/pricing") ? styles.itemActive : ""}`}
          aria-current={isActive("/pricing") ? "page" : undefined}
        >
          <PlanIcon />
          <span>प्लान</span>
        </Link>
      </nav>
    </>
  );
}