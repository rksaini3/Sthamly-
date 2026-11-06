"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import styles from "@/components/nav/BottomNav.module.css";

// बार सिर्फ इन्हीं पन्नों पर दिखेगा
const VISIBLE_ON = ["/dashboard", "/onboarding", "/pricing"] as const;

// "बोलें" बटन फिलहाल WhatsApp खोलता है, जहाँ वॉइस नोट भेजा जाता है
const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

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

function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
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

  const visible = VISIBLE_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!visible) return null;

  // नंबर न हो तो बोलें बटन पोस्ट वाले पन्ने पर जाएगा
  const voiceHref = WHATSAPP_NUMBER ? `https://wa.me/${WHATSAPP_NUMBER}` : "/onboarding";
  const voiceIsExternal = voiceHref.startsWith("http");

  return (
    <>
      {/* नीचे का बार सामग्री को ढकने न पाए, इसलिए जगह छोड़ी जाती है */}
      <div className={styles.spacer} aria-hidden />

      <nav className={styles.nav} aria-label="मुख्य मेनू">
        <TabLink
          href="/dashboard"
          label="आउटपुट"
          active={isActive(pathname, "/dashboard")}
          icon={<GridIcon />}
        />

        <TabLink
          href="/onboarding"
          label="पोस्ट"
          active={isActive(pathname, "/onboarding")}
          icon={<PlusIcon />}
        />

        <a
          href={voiceHref}
          className={styles.center}
          target={voiceIsExternal ? "_blank" : undefined}
          rel={voiceIsExternal ? "noreferrer" : undefined}
        >
          <span className={styles.centerCircle}>
            <MicIcon />
          </span>
          <span>बोलें</span>
        </a>

        <TabLink
          href="/pricing"
          label="खाता"
          active={isActive(pathname, "/pricing")}
          icon={<UserIcon />}
        />
      </nav>
    </>
  );
}

export default BottomNav;