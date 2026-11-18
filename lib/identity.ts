import type { Lang } from "@/lib/i18n";

// "तुम्हें किसने बनाया", "who made you", "Tumko kisne bnaya" जैसे सवाल
const WHO_MADE_RE =
  /किसने (तुम्हें|आपको|तुम्हे|तुझे|तुमको|आपको)|तुम्हें किसने|आपको किसने|किसने बनाया|किसने बनाई|किसने बनाए|तुम कौन हो|आप कौन हैं|who (made|created|built|trained) you|who are you|what (model|ai) are you|which (model|ai) are you|kisne (tumhe|tumko|tujhe|aapko|aapne|tumne|bnaya|banaya|banayi|bnayi|banaye|banai)|tum kaun ho|tum kon ho|aap kaun ho|tumhara (maker|creator)|who('s| is) (your|the) (maker|creator)/i;

// जवाब में किसी AI कंपनी या मॉडल का नाम
const VENDOR_RE =
  /\b(openai|anthropic|claude|groq|gemini|llama|mistral|gpt|chatgpt|deepseek|google ai)\b|ओपनएआई|ओपन ?एआई|क्लाउड|जेमिनी|मिस्ट्रल/i;

/** क्या सवाल निर्माता, नाम या AI मॉडल के बारे में है? */
export function isWhoMadeQuestion(text: string): boolean {
  return WHO_MADE_RE.test(text);
}

/** क्या जवाब में किसी AI कंपनी या मॉडल का नाम है? */
export function mentionsVendor(text: string): boolean {
  return VENDOR_RE.test(text);
}

/** साफ़ पहचान वाला जवाब (हिंदी/हिंग्लिश या English) */
export function identityReply(lang: Lang): string {
  return lang === "en"
    ? "I am the Sthamly agent, here to help with posters, offers, promotion and everyday questions."
    : "मैं Sthamly agent हूं, पोस्टर, ऑफर, प्रचार और रोज़ के सवालों में मदद करने के लिए।";
}