// भाषा का चुनाव cookie में रहता है, ताकि server भी उसी हिसाब से पन्ना बनाए
export const LANG_COOKIE = "sthamly_lang";

export type Lang = "hi" | "en";

export type Dict = {
  title: string;
  plan: string;
  planFree: string;
  planVip: string;
  usage: string;
  posters: string;
  reels: string;
  paidSoon: string;
  seePlans: string;
  role: string;
  changeRole: string;
  menu: string;
  menuOpen: string;
  menuClose: string;
  theme: string;
  themeLight: string;
  themeDark: string;
  themeSystem: string;
  language: string;
  langHi: string;
  langEn: string;
  privacy: string;
  terms: string;
  logout: string;
  deleteTitle: string;
  deleteBody: string;
  deleteAsk: string;
  deleteTypeHint: string;
  deleteBtn: string;
  deleting: string;
  errDelete: string;
  errNetwork: string;
  errLogout: string;
};

export const DICT: Record<Lang, Dict> = {
  hi: {
    title: "खाता",
    plan: "प्लान",
    planFree: "मुफ़्त",
    planVip: "वीआईपी पास",
    usage: "इस महीने का उपयोग",
    posters: "पोस्टर",
    reels: "रील",
    paidSoon: "वीआईपी पास का भुगतान जल्द शुरू होगा।",
    seePlans: "प्लान देखें",
    role: "भूमिका",
    changeRole: "भूमिका बदलें",
    menu: "मेन्यू",
    menuOpen: "मेन्यू खोलें",
    menuClose: "बंद करें",
    theme: "थीम",
    themeLight: "लाइट",
    themeDark: "डार्क",
    themeSystem: "सिस्टम",
    language: "भाषा",
    langHi: "हिंदी",
    langEn: "English",
    privacy: "गोपनीयता नीति",
    terms: "शर्तें",
    logout: "लॉग-आउट",
    deleteTitle: "मेरा खाता हटाएं",
    deleteBody: "दुकान, फ़ोटो, पोस्टर, बातचीत और खाता हमेशा के लिए हट जाएगा। यह वापस नहीं होगा।",
    deleteAsk: "खाता हटाने की पुष्टि करें",
    deleteTypeHint: "पक्का करने के लिए नीचे लिखें:",
    deleteBtn: "खाता हमेशा के लिए हटाएं",
    deleting: "हटाया जा रहा है...",
    errDelete: "खाता नहीं हट पाया, दोबारा कोशिश करें",
    errNetwork: "नेटवर्क की गड़बड़ी, दोबारा कोशिश करें",
    errLogout: "लॉग-आउट नहीं हो पाया, दोबारा कोशिश करें",
  },
  en: {
    title: "Account",
    plan: "Plan",
    planFree: "Free",
    planVip: "VIP Pass",
    usage: "Usage this month",
    posters: "Posters",
    reels: "Reels",
    paidSoon: "Payment for the VIP Pass starts soon.",
    seePlans: "See plans",
    role: "Role",
    changeRole: "Change role",
    menu: "Menu",
    menuOpen: "Open menu",
    menuClose: "Close",
    theme: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    language: "Language",
    langHi: "हिंदी",
    langEn: "English",
    privacy: "Privacy policy",
    terms: "Terms",
    logout: "Log out",
    deleteTitle: "Delete my account",
    deleteBody: "Your shop, photos, posters, chats and account will be deleted permanently. This cannot be undone.",
    deleteAsk: "Confirm account deletion",
    deleteTypeHint: "To confirm, type below:",
    deleteBtn: "Delete account permanently",
    deleting: "Deleting...",
    errDelete: "Could not delete the account, please try again",
    errNetwork: "Network problem, please try again",
    errLogout: "Could not log out, please try again",
  },
};

export function parseLang(value: string | undefined): Lang {
  return value === "en" ? "en" : "hi";
}