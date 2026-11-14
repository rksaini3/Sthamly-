"use client";

import { useEffect, useState } from "react";

// रंग: ऑटो (फ़ोन के हिसाब से), उजला, गहरा। चुनाव इसी फ़ोन में याद रहता है।
// पन्ना खुलने से पहले app/layout.tsx की छोटी script यही मान पढ़ती है, इसलिए रंग झपकता नहीं।
const THEME_KEY = "sthamly:theme";
type Choice = "system" | "light" | "dark";

function apply(choice: Choice) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = choice === "dark" || (choice === "system" && prefersDark);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function ThemeSwitch({
  label,
  labels,
}: {
  label: string;
  labels: { system: string; light: string; dark: string };
}) {
  const [choice, setChoice] = useState<Choice>("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark" || saved === "system") setChoice(saved);
    } catch {
      // storage बंद हो तो ऑटो ही रहेगा
    }
  }, []);

  // "ऑटो" में फ़ोन की सेटिंग बदले तो साथ में बदलें
  useEffect(() => {
    if (choice !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [choice]);

  function pick(next: Choice) {
    setChoice(next);
    apply(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // सेव न हो पाए तो भी अभी लागू हो गया है
    }
  }

  const options: { id: Choice; text: string }[] = [
    { id: "system", text: labels.system },
    { id: "light", text: labels.light },
    { id: "dark", text: labels.dark },
  ];

  return (
    <div
      role="group"
      aria-label={label}
      style={{
        display: "inline-flex",
        padding: 2,
        borderRadius: 999,
        border: "1px solid var(--line)",
        background: "var(--surface)",
      }}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={choice === o.id}
          onClick={() => pick(o.id)}
          style={{
            minHeight: 30,
            padding: "0 10px",
            border: "none",
            borderRadius: 999,
            font: "inherit",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            background: choice === o.id ? "var(--accent)" : "transparent",
            color: choice === o.id ? "var(--accent-ink)" : "var(--muted)",
          }}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}