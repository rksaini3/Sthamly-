// Sthamly AI web: bhasha ki suchi. Bharat ki 22 scheduled bhashayein, English aur Hinglish.
// `supported` sirf wahi true hai jo abhi poori tarah chalti hai (app ka text aur AI ka jawab).
// "auto" chunav hai, bhasha nahi: message ki bhasha se apne-aap tay hoti hai (lib/lang.ts).
// Nayi bhasha chalu karte waqt ye teen jagah ek saath badlein:
//   1. worker/src/routes/user.ts ki LANGUAGES list
//   2. worker/src/routes/chat.ts mein us bhasha ka prompt
//   3. web ke UI text ka anuvaad (lib/uiText.ts)

export type SupportedLanguage = "hi" | "hinglish" | "en";

export interface LanguageOption {
  code: string;
  label: string;
  english: string;
  supported: boolean;
}

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { code: "auto", label: "अपने-आप", english: "Auto (message se pehchaane)", supported: true },
  { code: "hi", label: "हिन्दी", english: "Hindi", supported: true },
  { code: "hinglish", label: "Hinglish", english: "Roman Hindi", supported: true },
  { code: "en", label: "English", english: "English", supported: true },
  { code: "as", label: "অসমীয়া", english: "Assamese", supported: false },
  { code: "bn", label: "বাংলা", english: "Bengali", supported: false },
  { code: "brx", label: "बड़ो", english: "Bodo", supported: false },
  { code: "doi", label: "डोगरी", english: "Dogri", supported: false },
  { code: "gu", label: "ગુજરાતી", english: "Gujarati", supported: false },
  { code: "kn", label: "ಕನ್ನಡ", english: "Kannada", supported: false },
  { code: "ks", label: "कॉशुर", english: "Kashmiri", supported: false },
  { code: "kok", label: "कोंकणी", english: "Konkani", supported: false },
  { code: "mai", label: "मैथिली", english: "Maithili", supported: false },
  { code: "ml", label: "മലയാളം", english: "Malayalam", supported: false },
  { code: "mni", label: "ꯃꯤꯇꯩ ꯂꯣꯟ", english: "Manipuri (Meitei)", supported: false },
  { code: "mr", label: "मराठी", english: "Marathi", supported: false },
  { code: "ne", label: "नेपाली", english: "Nepali", supported: false },
  { code: "or", label: "ଓଡ଼ିଆ", english: "Odia", supported: false },
  { code: "pa", label: "ਪੰਜਾਬੀ", english: "Punjabi", supported: false },
  { code: "sa", label: "संस्कृतम्", english: "Sanskrit", supported: false },
  { code: "sat", label: "ᱥᱟᱱᱛᱟᱲᱤ", english: "Santali", supported: false },
  { code: "sd", label: "سنڌي", english: "Sindhi", supported: false },
  { code: "ta", label: "தமிழ்", english: "Tamil", supported: false },
  { code: "te", label: "తెలుగు", english: "Telugu", supported: false },
  { code: "ur", label: "اردو", english: "Urdu", supported: false },
];

export function findLanguage(code: string): LanguageOption | undefined {
  return LANGUAGE_OPTIONS.find((o) => o.code === code);
}

export function isSupportedLanguage(code: string): code is SupportedLanguage {
  return code === "hi" || code === "hinglish" || code === "en";
}

const GUEST_LANG_KEY = "sthamly_guest_lang";

// Purani guest bhasha (ab lib/lang.ts ka chunav use hota hai). Compatibility ke liye rakhi hai.
export function readGuestLanguage(): string {
  try {
    const raw = window.localStorage.getItem(GUEST_LANG_KEY);
    return raw !== null && isSupportedLanguage(raw) ? raw : "hi";
  } catch {
    return "hi";
  }
}

export function writeGuestLanguage(code: SupportedLanguage): void {
  try {
    window.localStorage.setItem(GUEST_LANG_KEY, code);
  } catch {
    // Storage nahi chal rahi: is session mein state already badal chuka hai.
  }
}
