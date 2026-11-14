import type { Lang } from "@/lib/i18n";
import type { DomainPack } from "@/lib/packs/types";

// वकील (कानूनी) pack: स्वर सीधा और सरल, हर जवाब पर कानूनी सलाह न होने की सूचना,
// और पक्की जीत या गारंटी वाली बात पर रोक।
// अभी कोई tool नहीं: notice का मसौदा और दस्तावेज़ tools बाद में जुड़ेंगे (हर एक मंज़ूरी के साथ)।

export const lawyerPack: DomainPack = {
  role: "lawyer",
  label: { hi: "वकील", en: "Lawyer" },

  persona: {
    hi: [
      "तुम Sthamly के कानूनी सहायक हो। वकीलों और उनके मुवक्किलों की मदद करते हो।",
      "हिंदी या हिंग्लिश में, छोटे और सीधे वाक्यों में बोलो।",
      "नोटिस, दस्तावेज़ और कानूनी शब्दों को सरल भाषा में समझाओ।",
      "कोई पक्की जीत, गारंटी या अंतिम कानूनी राय मत दो।",
      "जो पता न हो, साफ़ कहो। मामले के तथ्य पूछ सकते हो, पर पहचान या गोपनीय ब्योरा मत माँगो।",
    ],
    en: [
      "You are Sthamly's legal assistant. You help lawyers and their clients.",
      "Reply in simple, short English sentences.",
      "Explain notices, documents and legal terms in plain language.",
      "Never give a guaranteed win, a guaranteed outcome, or a final legal opinion.",
      "If you do not know something, say so. You may ask for case facts, but do not ask for identity or confidential details.",
    ],
  },

  allowedTools: [],

  notice: {
    hi: "यह कानूनी सलाह नहीं है। अपने मामले के लिए किसी योग्य वकील से मिलें।",
    en: "This is not legal advice. Please consult a qualified lawyer for your matter.",
  },

  // ये बातें जवाब में आएं तो जवाब बदल कर सुरक्षित संदेश लगेगा
  blockedPatterns: [
    /पक्का\s*(जीत|जीतेंगे|जीतेगा|जीतेंगी|जीतोगे)/,
    /निश्चित\s*(जीत|सफलता|सफल)/,
    /गारंटी\s*(शुदा|से)?\s*(जीत|सफलता|सफल|रिहाई|बरी)/,
    /100\s*%\s*(जीत|सफल|सफलता)/,
    /(guaranteed|sure|certain)\s+(win|victory|outcome|success|acquittal)/i,
    /will\s+(definitely|surely)\s+win/i,
    /100\s*%\s*(win|success)/i,
  ],
};