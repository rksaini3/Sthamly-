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
//
// स्थिति (Nov 2026):
// - image: "fal-ai/flux/schnell" endpoint ID मिला है, output का ढांचा अभी जांचना है।
// - text: "fal-ai/any-llm" Fal पर deprecated है। नया text model चुनना बाकी है।
// ============================================================

const QUEUE_BASE = "https://queue.fal.run";

// लागत paise में। image का दाम Fal पर लगभग $0.003 प्रति image दिखा (cloudprice)।
// text का दाम अभी तय नहीं है, इसलिए अनुमान है।
export const FAL_MODELS = {
  image: { id: "fal-ai/flux/schnell", costPaise: 25, verified: false },
  video: { id: "REPLACE/video-model", costPaise: 450, verified: false },
  text: { id: "REPLACE/text-model", costPaise: 5, verified: false },
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

// Submit का जवाब: status और result के URLs भी इसी में आते हैं
interface SubmitResponse {
  request_id: string;
  status_url: string;
  response_url: string;
}

/**
 * Fal queue: submit करें, status देखें, फिर result लें।
 * Status और result के URLs submit के जवाब से लिए जाते हैं (Fal docs के अनुसार),
 * खुद से नहीं बनाए जाते, क्योंकि कुछ models के path अलग होते हैं।
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
  const { status_url, response_url } = (await submit.json()) as SubmitResponse;

  const startedAt = Date.now();
  while (true) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`fal timeout (${modelId}) after ${timeoutMs}ms`);
    }

    const statusRes = await fetch(status_url, { headers });
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

  const resultRes = await fetch(response_url, { headers });
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

    const output = await runModel<FalOutput>(
      FAL_MODELS.text.id,
      { prompt: req.prompt, max_tokens: req.maxTokens ?? 500 },
      TIMEOUT_MS.text,
    );
    const text = output.output ?? output.text;
    if (!text) {
      throw new Error("fal text: output खाली है");
    }

    return { text, costPaise: FAL_MODELS.text.costPaise };
  },
};