import type { AIProvider, AIResult, ImageRequest, TextRequest, TranscribeRequest } from "@/lib/ai/types";

// Cloudflare Workers AI: image के लिए FLUX.1 schnell।
// Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN (Workers AI permission वाला token)।
// Free tier: रोज़ 10,000 Neurons। FLUX schnell का खर्च लगभग 9.6 Neurons प्रति step।
// Model बदलना हो तो CLOUDFLARE_IMAGE_MODEL सेट करें।
// Docs: https://developers.cloudflare.com/workers-ai/models/flux-1-schnell

const API_BASE = "https://api.cloudflare.com/client/v4/accounts";
const DEFAULT_IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const IMAGE_STEPS = 4;
const IMAGE_TIMEOUT_MS = 60_000;
const MAX_PROMPT_CHARS = 2048;
// अंदाज़ा: मुफ़्त tier में यह लगभग शून्य है। पैसा लगे तो असली हिसाब से सुधारें।
const IMAGE_COST_PAISE = 4;

function credentials(): { accountId: string; token: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !token) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID या CLOUDFLARE_API_TOKEN सेट नहीं है");
  }
  return { accountId, token };
}

function unsupported(task: string): never {
  throw new Error(`Cloudflare provider पर ${task} समर्थित नहीं है। उसके लिए दूसरा provider रखें।`);
}

export const cloudflareProvider: AIProvider = {
  name: "cloudflare",

  async generateImage(req: ImageRequest): Promise<AIResult> {
    const { accountId, token } = credentials();
    const model = process.env.CLOUDFLARE_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;

    const res = await fetch(`${API_BASE}/${accountId}/ai/run/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: req.prompt.slice(0, MAX_PROMPT_CHARS),
        steps: IMAGE_STEPS,
      }),
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`cloudflare image failed (${res.status}): ${detail.slice(0, 200)}`);
    }

    // REST जवाब आमतौर पर { result: { image } } में आता है; सीधा { image } भी संभालें
    const data = (await res.json()) as { result?: { image?: string }; image?: string };
    const base64 = data.result?.image ?? data.image;
    if (!base64) {
      throw new Error("cloudflare image: output में image नहीं मिली");
    }

    // Base64 image को data URL बनाकर लौटाएं (अलग storage की ज़रूरत नहीं)
    return { url: `data:image/jpeg;base64,${base64}`, costPaise: IMAGE_COST_PAISE };
  },

  async generateVideo(): Promise<AIResult> {
    unsupported("video");
  },

  async generateText(_req: TextRequest): Promise<AIResult> {
    unsupported("text");
  },

  async transcribe(_req: TranscribeRequest): Promise<AIResult> {
    unsupported("voice");
  },
};
