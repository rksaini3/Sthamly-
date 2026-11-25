// Sthamly AI web: bhasha ka chunav aur message se pehchan.
// Chunav "auto" (default): har message ki bhasha se tay hota hai.
//   Sirf Hindi (Devanagari) -> hi. Sirf English -> en. Hindi + English mix -> hinglish.
//   Roman mein Hindi shabd (kaise, hai, mera...) ho to -> hinglish.
// Chunav "hi" / "hinglish" / "en": user ne khud chuna hai, toh hamesha wahi.
// Device par yaad rehta hai. Chunav aur bhasha dono ek hi jagah se chalte hain.

import type { SupportedLanguage } from "./languages";

export type LangChoice = "auto" | SupportedLanguage;

export const LANG_CHOICE_KEY = "sthamly_lang_choice";
export const DEFAULT_CHOICE: LangChoice = "auto";
// Shuruaat mein (abhi koi message nahi) bhasha hindi.
export const DEFAULT_AUTO_LANG: SupportedLanguage = "hi";

export function isLangChoice(value: unknown): value is LangChoice {
  return value === "auto" || value === "hi" || value === "hinglish" || value === "en";
}

export function readChoice(): LangChoice {
  try {
    const raw = window.localStorage.getItem(LANG_CHOICE_KEY);
    return isLangChoice(raw) ? raw : DEFAULT_CHOICE;
  } catch {
    return DEFAULT_CHOICE;
  }
}

export function writeChoice(choice: LangChoice): void {
  try {
    window.localStorage.setItem(LANG_CHOICE_KEY, choice);
  } catch {
    // Storage nahi chal rahi: is session mein chunav already lag chuka hai.
  }
}

// Roman (English akshar mein) mein aam Hindi shabd. Inse pata chalta hai ki wo Hinglish hai, English nahi.
const ROMAN_HINDI_WORDS = new Set([
  "kaise", "kya", "kyu", "kyun", "kab", "kitna", "kitni", "kitne", "hai", "hain", "ho", "hun",
  "mera", "meri", "mere", "mujhe", "aap", "tum", "tumhara", "apna", "apni", "nahi", "nahin",
  "karo", "kar", "karna", "kare", "bhai", "batao", "bata", "bhejo", "likho", "samjhao",
  "chahiye", "ka", "ki", "ke", "se", "ko", "aur", "yeh", "ye", "woh", "wo", "dukan", "paisa",
  "sahi", "theek", "accha", "achha", "dijiye", "bolo",
]);

// Message ki bhasha pehchanta hai. Bahut chhota ya samajh na aaye to null (pichhli bhasha chalegi).
export function detectLanguage(text: string): SupportedLanguage | null {
  const cleaned = text.replace(/https?:\/\/\S+/g, " ");
  const devanagari = (cleaned.match(/[ऀ-ॿ]/g) ?? []).length;
  const latinWords = cleaned.match(/[A-Za-z]+/g) ?? [];
  const latin = latinWords.reduce((sum, w) => sum + w.length, 0);

  if (devanagari + latin < 3) return null;
  if (devanagari > 0 && latin > 0) return "hinglish";
  if (devanagari > 0) return "hi";

  const hasRomanHindi = latinWords.some((w) => ROMAN_HINDI_WORDS.has(w.toLowerCase()));
  return hasRomanHindi ? "hinglish" : "en";
}
