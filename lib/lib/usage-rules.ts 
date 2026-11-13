import type { Plan } from "@/types/domain";

// इस्तेमाल के नियम और कीमतें। इस फ़ाइल में सिर्फ़ नंबर हैं, इसलिए पन्नों (client) में भी import हो सकती है।
// कीमत या सीमा बदलनी हो तो सिर्फ़ यहाँ बदलें।
// नियम: रोज़ की शामिल सीमा तक मुफ़्त (या प्लान में शामिल)। उसके बाद वॉलेट से थोड़े पैसे कटते हैं।

export type UsageKind = "chat" | "live";

// रोज़ कितना शामिल है (IST दिन के हिसाब से)
export const INCLUDED_PER_DAY: Record<Plan, Record<UsageKind, number>> = {
  free: { chat: 25, live: 3 },
  starter: { chat: 150, live: 15 },
  premium: { chat: 400, live: 40 },
  business: { chat: 1500, live: 150 },
};

// शामिल सीमा के बाद हर बार की कीमत (paise)
export const EXTRA_PRICE_PAISE: Record<UsageKind, number> = {
  chat: 50, // ₹0.5 प्रति संदेश
  live: 100, // ₹1 प्रति लाइव सवाल
};