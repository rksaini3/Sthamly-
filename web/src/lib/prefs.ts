// Sthamly AI web: user ki pasand: role (user ya partner), akshar ka aakar aur theme.
// Partner mode alag rang mein dikhta hai, taaki partner galti se user mode mein na chala jaaye.
// Document par data-role, data-text-size aur data-theme lagte hain. access.css aur themes.css unhe padhte hain.

import { browserStore, type KeyValueStore } from "./storage";

export type UserRole = "user" | "partner";
export type TextSize = "normal" | "large" | "xlarge";
// dark: default. light: halka. system: phone ki setting ke hisaab se. eye_care: aankhon ke liye garam rang.
export type ThemeChoice = "dark" | "light" | "system" | "eye_care";

export interface Prefs {
  role: UserRole;
  textSize: TextSize;
  theme: ThemeChoice;
}

export const PREFS_KEY = "sthamly_prefs_v1";
export const DEFAULT_PREFS: Prefs = { role: "user", textSize: "normal", theme: "dark" };

function isTheme(value: unknown): value is ThemeChoice {
  return value === "dark" || value === "light" || value === "system" || value === "eye_care";
}

export function parsePrefs(raw: string | null): Prefs {
  if (raw === null) return DEFAULT_PREFS;
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof Prefs, unknown>>;
    return {
      role: v.role === "partner" ? "partner" : "user",
      textSize: v.textSize === "large" || v.textSize === "xlarge" ? v.textSize : "normal",
      theme: isTheme(v.theme) ? v.theme : DEFAULT_PREFS.theme,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function readPrefs(store: KeyValueStore = browserStore()): Prefs {
  return parsePrefs(store.get(PREFS_KEY));
}

export function writePrefs(prefs: Prefs, store: KeyValueStore = browserStore()): void {
  store.set(PREFS_KEY, JSON.stringify(prefs));
}

// Document par attributes lagata hai. document na ho (test ya SSR) to kuch nahi karta.
// system par data-theme hata dete hain, taaki styles.css ka prefers-color-scheme apna kaam kare.
export function applyPrefs(prefs: Prefs): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.role = prefs.role;
  root.dataset.textSize = prefs.textSize;
  if (prefs.theme === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = prefs.theme === "eye_care" ? "eye-care" : prefs.theme;
  }
}