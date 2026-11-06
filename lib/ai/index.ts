import { falProvider } from "@/lib/ai/fal";
import type { AIProvider } from "@/lib/ai/types";

export type { AIProvider, AIResult } from "@/lib/ai/types";

/** AI_PROVIDER env से provider चुनें। अभी सिर्फ Fal। */
export function getAIProvider(): AIProvider {
  const name = process.env.AI_PROVIDER ?? "fal";
  switch (name) {
    case "fal":
      return falProvider;
    default:
      throw new Error(`Unknown AI_PROVIDER: ${name}`);
  }
}