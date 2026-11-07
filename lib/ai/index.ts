import { falProvider } from "@/lib/ai/fal";
import { groqProvider } from "@/lib/ai/groq";
import { openrouterProvider } from "@/lib/ai/openrouter";
import type { AIProvider } from "@/lib/ai/types";

export type { AIProvider, AIResult } from "@/lib/ai/types";

// सभी उपलब्ध providers। नया provider जोड़ना = यहां एक पंक्ति।
const PROVIDERS: Record<string, AIProvider> = {
  fal: falProvider,
  openrouter: openrouterProvider,
  groq: groqProvider,
};

function pick(envName: string): AIProvider {
  // पहले उस काम का env, फिर AI_PROVIDER, और आखिर में fal
  const name = process.env[envName] ?? process.env.AI_PROVIDER ?? "fal";
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown ${envName}: ${name}`);
  }
  return provider;
}

/**
 * हर काम का provider अलग चुना जाता है:
 * - IMAGE_PROVIDER: पोस्टर की फ़ोटो (अभी fal)
 * - TEXT_PROVIDER: ऑफ़र समझना और कैप्शन (fal, openrouter या groq)
 * - VOICE_PROVIDER: बोली हुई बात को text में बदलना (fal या groq)
 */
export function getAIProvider(): AIProvider {
  const image = pick("IMAGE_PROVIDER");
  const text = pick("TEXT_PROVIDER");
  const voice = pick("VOICE_PROVIDER");

  return {
    name: `image:${image.name} text:${text.name} voice:${voice.name}`,
    generateImage: image.generateImage,
    generateVideo: image.generateVideo,
    generateText: text.generateText,
    transcribe: voice.transcribe,
  };
}