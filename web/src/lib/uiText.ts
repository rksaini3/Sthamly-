// Sthamly AI web: UI ke shabd teeno bhashaon mein. Naya shabd jodein to teeno jagah bharein.
// Abhi main screen (header, tabs, cards, composer) yahan se chalte hain. Baaki screens agle kadam mein.

import type { SupportedLanguage } from "./languages";

const UI = {
  newChat: { hi: "नई बातचीत", hinglish: "Nayi baatcheet", en: "New chat" },
  menuOpen: { hi: "मेन्यू खोलें", hinglish: "Menu kholein", en: "Open menu" },
  upgrade: { hi: "Upgrade", hinglish: "Upgrade", en: "Upgrade" },
  booster: { hi: "+ Booster", hinglish: "+ Booster", en: "+ Booster" },
  composerPlaceholder: { hi: "अपना सवाल लिखें…", hinglish: "Apna sawal likhein…", en: "Type your question…" },
  qrSoon: { hi: "QR जल्द आ रहा है", hinglish: "QR jald aa raha hai", en: "QR coming soon" },
  creditsLeft: { hi: "बचे क्रेडिट", hinglish: "Bache credits", en: "Credits left" },
  planFree: { hi: "फ्री प्लान", hinglish: "Free plan", en: "Free plan" },
  planBasic: { hi: "बेसिक प्लान", hinglish: "Basic plan", en: "Basic plan" },
  planPro: { hi: "प्रो प्लान", hinglish: "Pro plan", en: "Pro plan" },
  planSuper: { hi: "सुपर प्लान", hinglish: "Super plan", en: "Super plan" },
  planLoading: { hi: "प्लान", hinglish: "Plan", en: "Plan" },
  toolsAria: { hi: "टूल", hinglish: "Tools", en: "Tools" },
  categoriesAria: { hi: "श्रेणियाँ", hinglish: "Shreniyaan", en: "Categories" },
} as const;

export type UiKey = keyof typeof UI;

export function t(lang: SupportedLanguage, key: UiKey): string {
  return UI[key][lang];
}
