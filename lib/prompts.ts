import type { JobInput } from "@/types/domain";

// Prompts यहीं रहेंगे, ताकि बाद में A/B test और सुधार आसान हो।
// AI से हिंदी का spelling वाला टेक्स्ट poster पर न लिखवाएं। वह satori से लिखा जाएगा।

export function buildCaptionPrompt(input: JobInput): string {
  return [
    `दुकान: ${input.shopName} (${input.category}), शहर: ${input.city}`,
    `ऑफर: ${input.offerText}`,
    input.occasion ? `मौका: ${input.occasion}` : "",
    `भाषा: ${input.language}`,
    "",
    "3 छोटे Instagram कैप्शन लिखें। हर कैप्शन में एक हुक, ऑफर, और एक call-to-action हो।",
    "कोई झूठा दावा (जैसे 'नंबर 1', 'सबसे सस्ता') न लिखें।",
    "हैशटैग 5 तक रखें।",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildReelPrompt(input: JobInput): string {
  return [
    `${input.category} की दुकान "${input.shopName}" के लिए 15 सेकंड की vertical रील।`,
    `मूड: ${input.occasion ?? "रोज़ का ऑफर"}, ऑफर: ${input.offerText}`,
    "साफ, गर्म रोशनी, कोई जाना-पहचाना ब्रांड या सेलिब्रिटी नहीं।",
  ].join("\n");
}