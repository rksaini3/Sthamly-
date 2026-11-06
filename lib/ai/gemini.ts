import { getServerEnv } from "@/lib/env";
import type {
  AIProvider,
  AIResult,
  ImageRequest,
  TextRequest,
  VideoRequest,
} from "@/lib/ai/types";

// Caption के लिए Google Gemini (REST API)
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const TIMEOUT_MS = 30_000;

// Caption की अनुमानित लागत, paise में (docs/MVP_BRIEF.md: लगभग ₹0.05)।
// असली token के हिसाब से लागत बाद में जोड़ी जा सकती है।
const TEXT_COST_PAISE = 5;

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  error?: { message?: string };
}

export const geminiProvider: AIProvider = {
  name: "gemini",

  async generateImage(_req: ImageRequest): Promise<AIResult> {
    // पोस्टर satori से बनता है, इसलिए image के लिए fal इस्तेमाल होगा
    throw new Error("gemini provider में image नहीं है। image के लिए fal चुनें।");
  },

  async generateVideo(_req: VideoRequest): Promise<AIResult> {
    throw new Error("gemini provider में video नहीं है।");
  },

  async generateText(req: TextRequest): Promise<AIResult> {
    const { GEMINI_API_KEY, GEMINI_MODEL } = getServerEnv();
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY सेट नहीं है");
    }
    const model = GEMINI_MODEL ?? DEFAULT_MODEL;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: req.prompt }] }],
          generationConfig: {
            maxOutputTokens: req.maxTokens ?? 400,
            temperature: 0.7,
          },
        }),
        signal: controller.signal,
      });

      const body = (await res.json()) as GeminiResponse;

      if (!res.ok) {
        throw new Error(`gemini failed (${res.status}): ${body.error?.message ?? "unknown"}`);
      }

      const candidate = body.candidates?.[0];
      const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("").trim();
      if (!text) {
        throw new Error(`gemini: जवाब खाली है (finish: ${candidate?.finishReason ?? "unknown"})`);
      }

      return { text, costPaise: TEXT_COST_PAISE };
    } finally {
      clearTimeout(timer);
    }
  },
};