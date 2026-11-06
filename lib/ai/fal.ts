import { getServerEnv } from "@/lib/env";
import type {
  AIProvider,
  AIResult,
  ImageRequest,
  TextRequest,
  VideoRequest,
} from "@/lib/ai/types";

// ============================================================
// ⚠️ VERIFY BEFORE PRODUCTION
// model ID, input/output का ढांचा और दाम Fal.ai की आधिकारिक
// pricing और API docs से जांचकर ही बदलें।
// verified: true करने से पहले कोई असली AI call न करें।
// Text model अभी unverified है: एक बार असली test call करें,
// output में `output` फील्ड आ रही हो तो verified: true करें।
// ============================================================

const QUEUE_BASE = "https://queue.fal.run";

// Text के लिए OpenRouter router, और उसके ज़रिए Claude Haiku 5.5
const TEXT_MODEL = "anthropic/claude-haiku-5.5";

// लागत paise में। ये docs/MVP_BRIEF.md के अनुमान हैं (पोस्टर ₹0.15, रील ₹4.50, कैप्शन ₹0.05)।
export const FAL_MODELS = {
  image: { id: "fal-ai/flux/schnell", costPaise: 15, verified: false },
  video: { id: "REPLACE/video-model", costPaise: 450, verified: false },
  text: { id: "openrouter/router", costPaise: 5, verified: false },
} as const;

const TIMEOUT_MS = {
  image: 60_000,
  video: 300_000,
  text: 30_000,
} as const;

const POLL_INTERVAL_MS = 2_000;

function falHeaders(): Record<string, string> {
  const { FAL_KEY } = getServerEnv();
  if (!FAL_KEY) {
    throw new Error("FAL_KEY सेट नहीं है");
  }
  return {
    Authorization: `Key ${FAL_KEY}`,
    "Content-Type": "application/json",
  };
}

function assertVerified(model: { id: string; verified: boolean }): void {
  if (!model.verified) {
    throw new Error(`Fal model "${model.id}" अभी verify नहीं हुआ है। lib/ai/fal.ts देखें।`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fal queue submit का जवाब: status और result के URL यहीं से लें, खुद न बनाएं
interface QueueSubmit {
  request_id: string;
  status_url: string;
  response_url: string;
}

/**
 * Fal queue: submit करें, status देखें, फिर result लें।
 * लंबे काम (रील) के लिए queue ज़रूरी है, वरना request कट सकती है।
 */
async function runModel<T>(modelId: string, input: unknown, timeoutMs: number): Promise<T> {
  const headers = falHeaders();

  const submit = await fetch(`${QUEUE_BASE}/${modelId}`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  if (!submit.ok) {
    throw new Error(`fal submit failed (${submit.status}): ${await submit.text()}`);
  }
  const queued = (await submit.json()) as QueueSubmit;

  const startedAt = Date.now();
  while (true) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`fal timeout (${modelId}) after ${timeoutMs}ms`);
    }

    const statusRes = await fetch(queued.status_url, { headers });
    if (!statusRes.ok) {
      throw new Error(`fal status failed (${statusRes.status})`);
    }
    const { status } = (await statusRes.json()) as { status: string };

    if (status === "COMPLETED") break;
    if (status !== "IN_QUEUE" && status !== "IN_PROGRESS") {
      throw new Error(`fal unexpected status: ${status}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }

  const resultRes = await fetch(queued.response_url, { headers });
  if (!resultRes.ok) {
    throw new Error(`fal result failed (${resultRes.status})`);
  }
  return (await resultRes.json()) as T;
}

// Fal के output का वह हिस्सा जो हम इस्तेमाल करते हैं (मॉडल के हिसाब से इनमें से एक होगा)
interface FalOutput {
  images?: { url?: string }[];
  video?: { url?: string };
  output?: string;
  text?: string;
}

// Output से URL निकालना, ढांचा न मिले तो साफ error
function pickUrl(output: FalOutput, path: (o: FalOutput) => unknown, label: string): string {
  const url = path(output);
  if (typeof url !== "string" || url.length === 0) {
    throw new Error(`fal ${label}: output में URL नहीं मिला`);
  }
  return url;
}

export const falProvider: AIProvider = {
  name: "fal",

  async generateImage(req: ImageRequest): Promise<AIResult> {
    assertVerified(FAL_MODELS.image);

    const output = await runModel<FalOutput>(
      FAL_MODELS.image.id,
      { prompt: req.prompt, aspect_ratio: req.size },
      TIMEOUT_MS.image,
    );
    const url = pickUrl(output, (o) => o.images?.[0]?.url, "image");

    return { url, costPaise: FAL_MODELS.image.costPaise };
  },

  async generateVideo(req: VideoRequest): Promise<AIResult> {
    assertVerified(FAL_MODELS.video);

    const output = await runModel<FalOutput>(
      FAL_MODELS.video.id,
      { prompt: req.prompt, duration: req.seconds, aspect_ratio: req.aspect },
      TIMEOUT_MS.video,
    );
    const url = pickUrl(output, (o) => o.video?.url, "video");

    return { url, costPaise: FAL_MODELS.video.costPaise };
  },

  async generateText(req: TextRequest): Promise<AIResult> {
    assertVerified(FAL_MODELS.text);

    // maxTokens अभी भेजा नहीं जाता: router का इनपुट ढांचा test के बाद ही तय होगा
    const output = await runModel<FalOutput>(
      FAL_MODELS.text.id,
      { prompt: req.prompt, model: TEXT_MODEL },
      TIMEOUT_MS.text,
    );
    const text = output.output ?? output.text;
    if (!text) {
      throw new Error("fal text: output खाली है");
    }

    return { text, costPaise: FAL_MODELS.text.costPaise };
  },
};