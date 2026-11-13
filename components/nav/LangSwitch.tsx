"use client";

import { useRouter } from "next/navigation";
import { LANG_COOKIE, type Lang } from "@/lib/i18n";

// हिं | EN: दबाते ही पूरा ऐप उसी भाषा में हो जाता है (चुनाव cookie में याद रहता है)
export function LangSwitch({ lang, label }: { lang: Lang; label: string }) {
  const router = useRouter();

  function pick(next: Lang) {
    if (next === lang) return;
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  const base = {
    minHeight: 36,
    minWidth: 44,
    padding: "0 10px",
    border: "none",
    font: "inherit",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  } as const;

  return (
    <div
      role="group"
      aria-label={label}
      style={{
        display: "inline-flex",
        overflow: "hidden",
        borderRadius: 999,
        border: "1px solid var(--line)",
        background: "var(--surface-2)",
      }}
    >
      {(["hi", "en"] as const).map((l) => {
        const active = l === lang;
        return (
          <button
            key={l}
            type="button"
            aria-pressed={active}
            onClick={() => pick(l)}
            style={{
              ...base,
              background: active ? "var(--accent)" : "transparent",
              color: active ? "var(--accent-ink, #fff)" : "var(--ink)",
            }}
          >
            {l === "hi" ? "हिं" : "EN"}
          </button>
        );
      })}
    </div>
  );
}