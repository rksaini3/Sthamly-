"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "@/components/nav/BottomNav.module.css";

// बार सिर्फ इन्हीं पन्नों पर दिखेगा
const VISIBLE_ON = ["/dashboard", "/onboarding", "/pricing"] as const;

interface NavItem {
  href: string;
  label: string;
}

const LEFT: NavItem = { href: "/dashboard", label: "आउटपुट" };
const CENTER: NavItem = { href: "/onboarding", label: "पोस्ट" };
const RIGHT: NavItem = { href: "/pricing", label: "खाता" }; // बाद में /account बनेगा

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// बाएं tab का icon: चार खाने (आउटपुट की सूची)
function GridIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </svg>
  );
}

// दाएं tab का icon: व्यक्ति (खाता)
function UserIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" strokeLinecap="round" />
    </svg>
  );
}

// बीच का बड़ा बटन: पोस्टर वाला icon (सफेद कागज़ और चमक)
function PostIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 48 48" fill="none" aria-hidden>
      <rect x="10" y="6" width="28" height="36" rx="5" fill="#fff" />
      <rect x="15" y="13" width="18" height="12" rx="2" fill="#e0561a" opacity="0.35" />
      <rect x="15" y="29" width="18" height="3" rx="1.5" fill="#e0561a" />
      <rect x="15" y="35" width="11" height="3" rx="1.5" fill="#e0561a" />
      <path d="M38 6l1.4 3.2L42.6 10.6 39.4 12 38 15.2 36.6 12 33.4 10.6 36.6 9.2Z" fill="#fff" />
    </svg>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  const visible = VISIBLE_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!visible) return null;

  return (
    <>
      {/* नीचे का बार सामग्री को ढकने न पाए, इसलिए जगह छोड़ी जाती है */}
      <div className={styles.spacer} aria-hidden />

      <nav className={styles.nav} aria-label="मुख्य मेनू">
        <Link
          href={LEFT.href}
          className={`${styles.item} ${isActive(pathname, LEFT.href) ? styles.itemActive : ""}`}
          aria-current={isActive(pathname, LEFT.href) ? "page" : undefined}
        >
          <GridIcon />
          <span>{LEFT.label}</span>
        </Link>

        <Link
          href={CENTER.href}
          className={styles.center}
          aria-current={isActive(pathname, CENTER.href) ? "page" : undefined}
        >
          <span className={styles.centerCircle}>
            <PostIcon />
          </span>
          <span>{CENTER.label}</span>
        </Link>

        <Link
          href={RIGHT.href}
          className={`${styles.item} ${isActive(pathname, RIGHT.href) ? styles.itemActive : ""}`}
          aria-current={isActive(pathname, RIGHT.href) ? "page" : undefined}
        >
          <UserIcon />
          <span>{RIGHT.label}</span>
        </Link>
      </nav>
    </>
  );
}

export default BottomNav;