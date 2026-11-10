"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "@/components/nav/AppDrawer.module.css";

// ☰ इन पन्नों पर नहीं दिखेगा (लॉगिन, शुरुआती सेटअप, कानूनी पन्ने)
const HIDDEN_PREFIXES = ["/login", "/auth", "/onboarding", "/privacy", "/terms"] as const;

interface DrawerItem {
  href?: string; // न हो तो "जल्द" वाला, बिना लिंक का
  label: string;
}

// ड्रॉअर की सूची: यही पूरे ऐप का मुख्य रास्ता है
const ITEMS: DrawerItem[] = [
  { href: "/voice", label: "नया काम" },
  { href: "/my-posters", label: "मेरे बनाए" },
  { href: "/batch", label: "बैच" },
  { href: "/feed", label: "घोषणा" },
  { href: "/notifications", label: "सूचनाएं" },
  { href: "/account", label: "दुकान की जानकारी" },
];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function AppDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

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

  if (HIDDEN_PREFIXES.some((p) => matches(pathname, p))) return null;

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label="मेन्यू खोलें"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden>☰</span>
      </button>

      {open && (
        <div className={styles.overlay} onClick={() => setOpen(false)}>
          <aside
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label="मेन्यू"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.head}>
              <strong>Sthamly</strong>
              <button
                type="button"
                className={styles.close}
                aria-label="मेन्यू बंद करें"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>

            <nav className={styles.list} aria-label="मुख्य सूची">
              {ITEMS.map((item) =>
                item.href ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`${styles.link} ${matches(pathname, item.href) ? styles.active : ""}`}
                    aria-current={matches(pathname, item.href) ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span key={item.label} className={`${styles.link} ${styles.soon}`}>
                    {item.label} <small>जल्द</small>
                  </span>
                ),
              )}
            </nav>

            <Link href="/account" className={styles.profile} onClick={() => setOpen(false)}>
              खाता, वॉलेट और प्लान
            </Link>
          </aside>
        </div>
      )}
    </>
  );
}

export default AppDrawer;