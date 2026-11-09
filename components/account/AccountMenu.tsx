"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LANG_COOKIE, type Dict, type Lang } from "@/lib/i18n";

const THEME_KEY = "sthamly:theme";
type ThemeChoice = "light" | "dark" | "system";

function applyTheme(choice: ThemeChoice) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = choice === "dark" || (choice === "system" && prefersDark);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

type Props = {
  dict: Dict;
  lang: Lang;
  children: ReactNode;
};

export function AccountMenu({ dict, lang, children }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>("system");

  // सेव किया हुआ थीम पढ़ें
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark" || saved === "system") {
        setTheme(saved);
      }
    } catch {
      // storage बंद हो तो डिफ़ॉल्ट "system" रहेगा
    }
  }, []);

  // Escape दबाने पर मेन्यू बंद, और मेन्यू खुला हो तो पीछे का पन्ना न सरके
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

  function chooseTheme(choice: ThemeChoice) {
    setTheme(choice);
    applyTheme(choice);
    try {
      localStorage.setItem(THEME_KEY, choice);
    } catch {
      // सेव न हो पाए तो भी थीम अभी लागू हो गई है
    }
  }

  function chooseLang(next: Lang) {
    if (next === lang) return;
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  const themeOptions: { id: ThemeChoice; label: string }[] = [
    { id: "light", label: dict.themeLight },
    { id: "dark", label: dict.themeDark },
    { id: "system", label: dict.themeSystem },
  ];

  const langOptions: { id: Lang; label: string }[] = [
    { id: "hi", label: dict.langHi },
    { id: "en", label: dict.langEn },
  ];

  return (
    <>
      <button
        type="button"
        className="menu-btn"
        aria-label={dict.menuOpen}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden>☰</span>
      </button>

      {open && (
        <div className="drawer-overlay" onClick={() => setOpen(false)}>
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label={dict.menu}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-head">
              <strong>{dict.menu}</strong>
              <button
                type="button"
                className="menu-btn"
                aria-label={dict.menuClose}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>

            <section className="drawer-section">
              <span className="drawer-label">{dict.theme}</span>
              <div className="seg" role="radiogroup" aria-label={dict.theme}>
                {themeOptions.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={theme === o.id}
                    className="seg-btn"
                    onClick={() => chooseTheme(o.id)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="drawer-section">
              <span className="drawer-label">{dict.language}</span>
              <div className="seg" role="radiogroup" aria-label={dict.language}>
                {langOptions.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={lang === o.id}
                    className="seg-btn"
                    onClick={() => chooseLang(o.id)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="drawer-section">
              <Link href="/pricing" className="drawer-link">
                {dict.plan}
              </Link>
              <Link href="/settings" className="drawer-link">
                सेटिंग्स
              </Link>
              <Link href="/role" className="drawer-link">
                {dict.changeRole}
              </Link>
              <Link href="/privacy" className="drawer-link">
                {dict.privacy}
              </Link>
              <Link href="/terms" className="drawer-link">
                {dict.terms}
              </Link>
            </section>

            <section className="drawer-section">{children}</section>
          </aside>
        </div>
      )}
    </>
  );
}