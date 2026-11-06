import { falProvider } from "@/lib/ai/fal";
import { openrouterProvider } from "@/lib/ai/openrouter";
import type { AIProvider } from "@/lib/ai/types";

export type { AIProvider, AIResult } from "@/lib/ai/types";

/**
 * AI_PROVIDER env से मुख्य provider चुनें (अभी सिर्फ fal)।
 * TEXT_PROVIDER=openrouter हो तो सिर्फ text काम OpenRouter से होगा।
 * Image, video और voice transcription Fal से ही चलते रहेंगे।
 */
export function getAIProvider(): AIProvider {
  const name = process.env.AI_PROVIDER ?? "fal";
  if (name !== "fal") {
    throw new Error(`Unknown AI_PROVIDER: ${name}`);
  }

  if (process.env.TEXT_PROVIDER === "openrouter") {
    return {
      ...falProvider,
      name: "fal+openrouter",
      generateText: openrouterProvider.generateText,
    };
  }

  return falProvider;
}