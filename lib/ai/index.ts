import { falProvider } from "@/lib/ai/fal";
import { geminiProvider } from "@/lib/ai/gemini";
import type { AIProvider } from "@/lib/ai/types";

export type { AIProvider, AIResult } from "@/lib/ai/types";

/** AI_PROVIDER env से provider चुनें। Default: gemini (caption के लिए)। */
export function getAIProvider(): AIProvider {
  const name = process.env.AI_PROVIDER ?? "gemini";
  switch (name) {
    case "gemini":
      return geminiProvider;
    case "fal":
      return falProvider;
    default:
      throw new Error(`Unknown AI_PROVIDER: ${name}`);
  }
}