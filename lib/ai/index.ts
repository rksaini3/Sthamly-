import { cloudflareProvider } from "@/lib/ai/cloudflare";
import { groqProvider } from "@/lib/ai/groq";
import { openrouterProvider } from "@/lib/ai/openrouter";
import type { AIProvider } from "@/lib/ai/types";

export type { AIProvider, AIResult } from "@/lib/ai/types";

// सभी उपलब्ध providers। नया provider जोड़ना = यहां एक पंक्ति।
// fal हटा दिया गया है: image अब सिर्फ़ Cloudflare Workers AI (FLUX.1 schnell) से बनती है।
const PROVIDERS: Record<string, AIProvider> = {
  openrouter: openrouterProvider,
  groq: groqProvider,
  cloudflare: cloudflareProvider,
};

// हर काम के लिए env चुनता है। env न हो तो AI_PROVIDER, और आखिर में उस काम का अपना डिफ़ॉल्ट।
function pick(envName: string, fallback: string): AIProvider {
  const name = process.env[envName] ?? process.env.AI_PROVIDER ?? fallback;
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown ${envName}: ${name}`);
  }
  return provider;
}

/**
 * हर काम का provider अलग चुना जाता है:
 * - IMAGE_PROVIDER: पोस्टर/स्टूडियो की तस्वीर (cloudflare)
 * - TEXT_PROVIDER: ऑफ़र समझना और कैप्शन (groq या openrouter)
 * - VOICE_PROVIDER: बोली हुई बात को text में बदलना (groq)
 */
export function getAIProvider(): AIProvider {
  const image = pick("IMAGE_PROVIDER", "cloudflare");
  const text = pick("TEXT_PROVIDER", "groq");
  const voice = pick("VOICE_PROVIDER", "groq");

  return {
    name: `image:${image.name} text:${text.name} voice:${voice.name}`,
    generateImage: image.generateImage,
    generateVideo: image.generateVideo,
    generateText: text.generateText,
    transcribe: voice.transcribe,
  };
}
