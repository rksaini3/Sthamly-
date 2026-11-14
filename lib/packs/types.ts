import type { Lang } from "@/lib/i18n";
import type { Role } from "@/types/domain";

// ---- पैक का ढांचा: हर भूमिका (vakil, finance, student, ...) इसी आकार का होगा ----

export interface DomainPack {
  role: Role;
  label: { hi: string; en: string };

  // model के लिए: इस भूमिका का स्वर और भूमिका (हर भाषा में अलग लाइनें)
  persona: Record<Lang, string[]>;

  // agent इन्हीं tools को चला सकता है (बाकी सब बंद)
  allowedTools: readonly string[];

  // हर जवाब के आख़िर में लगने वाली सूचना। पैक इसे बदल या हटा नहीं सकता।
  notice: Record<Lang, string>;

  // जवाब में ये शब्द/वाक्य आएं तो जवाब रोका जाए (जैसे पक्की गारंटी वाले दावे)
  blockedPatterns: readonly RegExp[];
}

// ---- सुरक्षा परत: हर पैक पर लागू, पैक खुद इसे नहीं छू सकता ----

// सूचना का पाठ पहले से जवाब में है तो दोबारा नहीं जुड़ेगा
function hasNotice(text: string, notice: string): boolean {
  return text.includes(notice.slice(0, 40));
}

/** जवाब के आख़िर में पैक की सूचना जोड़ें (अगर पहले से न हो)। */
export function applyNotice(pack: DomainPack, text: string, lang: Lang): string {
  const notice = pack.notice[lang];
  if (hasNotice(text, notice)) return text;
  return `${text.trim()}\n\n${notice}`;
}

export interface GuardedReply {
  text: string;
  // true हो तो मूल जवाब हटा दिया गया और सुरक्षित संदेश लगा
  replaced: boolean;
}

/**
 * जवाब जांचें: blocked शब्द मिले तो जवाब की जगह सुरक्षित संदेश।
 * सूचना हमेशा जुड़ती है, चाहे जवाब बदला गया हो या नहीं।
 */
export function guardReply(pack: DomainPack, raw: string, lang: Lang): GuardedReply {
  const blocked = pack.blockedPatterns.some((re) => re.test(raw));
  const body = blocked
    ? lang === "en"
      ? "I cannot give a guaranteed outcome or a firm legal opinion on this. Please consult a qualified professional."
      : "इस बात पर पक्का परिणाम या अंतिम कानूनी राय नहीं दे सकता। कृपया किसी योग्य वकील से मिलें।"
    : raw;

  return { text: applyNotice(pack, body, lang), replaced: blocked };
}

/** कोई पैक चुनें (अभी सिर्फ़ जोड़े गए पैक)। अनजान भूमिका के लिए null। */
export type PackRegistry = Partial<Record<Role, DomainPack>>;