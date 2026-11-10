"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "@/components/nav/AppDrawer.module.css";

// ☰ इन पन्नों पर नहीं दिखेगा (लॉगिन और कानूनी पन्ने)
const HIDDEN_PREFIXES = ["/login", "/auth", "/privacy", "/terms"] as const;

interface DrawerItem {
  href: string;
  label: string;
}

// ड्रॉअर की सूची (डिज़ाइन ड्राफ़्ट के हिसाब से)।
// "खोज" v1 में नहीं है, इसलिए यहां नहीं।
// "दुकान की जानकारी" और "पिछली बातचीत" के पन्ने अभी बने नहीं हैं।
const ITEMS: DrawerItem[] = [
  { href: "/voice", label: "नया काम" },
  { href: "/my-posters", label: "मेरे बनाए" },
  { href: "/batch", label: "बैच" },
  { href: "/feed", label: "घोषणा" },
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
              {ITEMS.map((item) => {
                const active = matches(pathname, item.href);
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`${styles.link} ${active ? styles.active : ""}`}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* नीचे: खाता (प्रोफ़ाइल का गोला) और घंटी */}
            <div className={styles.footer}>
              <Link
                href="/account"
                className={styles.avatar}
                aria-label="खाता"
                onClick={() => setOpen(false)}
              >
                <span aria-hidden>👤</span>
              </Link>
              <Link
                href="/notifications"
                className={styles.bell}
                aria-label="सूचनाएं"
                onClick={() => setOpen(false)}
              >
                <span aria-hidden>🔔</span>
              </Link>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

export default AppDrawer;