// Sthamly AI web: user ki pasand: role (user ya partner) aur akshar ka aakar.
// Partner mode alag rang mein dikhta hai, taaki partner galti se user mode mein na chala jaaye.
// Document par data-role aur data-text-size lagte hain. access.css unhe padhta hai.

import { browserStore, type KeyValueStore } from "./storage";

export type UserRole = "user" | "partner";
export type TextSize = "normal" | "large" | "xlarge";

export interface Prefs {
  role: UserRole;
  textSize: TextSize;
}

export const PREFS_KEY = "sthamly_prefs_v1";
export const DEFAULT_PREFS: Prefs = { role: "user", textSize: "normal" };

export function parsePrefs(raw: string | null): Prefs {
  if (raw === null) return DEFAULT_PREFS;
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof Prefs, unknown>>;
    return {
      role: v.role === "partner" ? "partner" : "user",
      textSize: v.textSize === "large" || v.textSize === "xlarge" ? v.textSize : "normal",
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
export function applyPrefs(prefs: Prefs): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.role = prefs.role;
  root.dataset.textSize = prefs.textSize;
}