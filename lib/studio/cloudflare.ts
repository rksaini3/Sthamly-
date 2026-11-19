// Studio के लिए Cloudflare Workers AI का text helper।
// Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN (वही जो image के लिए), और
// वैकल्पिक CLOUDFLARE_CODE_MODEL (डिफ़ॉल्ट: Qwen 2.5 Coder 32B)।
// Free tier: रोज़ 10,000 Neurons, यही कोटा image और text दोनों इस्तेमाल करते हैं।

const API_BASE = "https://api.cloudflare.com/client/v4/accounts";
const DEFAULT_TEXT_MODEL = "@cf/qwen/qwen2.5-coder-32b-instruct";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function credentials(): { accountId: string; token: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !token) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID या CLOUDFLARE_API_TOKEN सेट नहीं है");
  }
  return { accountId, token };
}

export function studioTextModel(): string {
  return process.env.CLOUDFLARE_CODE_MODEL?.trim() || DEFAULT_TEXT_MODEL;
}

/** पूरा जवाब एक बार में (JSON के लिए)। */
export async function completeText(messages: ChatMessage[], maxTokens: number, timeoutMs = 120_000): Promise<string> {
  const { accountId, token } = credentials();
  const res = await fetch(`${API_BASE}/${accountId}/ai/run/${studioTextModel()}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`cloudflare text failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { result?: { response?: string } };
  const text = data.result?.response;
  if (!text) throw new Error("cloudflare text: output खाली है");
  return text;
}

/**
 * Cloudflare का SSE स्ट्रीम पढ़कर सिर्फ़ टेक्स्ट के टुकड़े एक साधारण stream में लौटाता है।
 * हर `data: {"response": "..."}` लाइन का response हिस्सा भेजा जाता है।
 */
export async function streamText(messages: ChatMessage[], maxTokens: number, timeoutMs = 280_000): Promise<ReadableStream<Uint8Array>> {
  const { accountId, token } = credentials();
  const upstream = await fetch(`${API_BASE}/${accountId}/ai/run/${studioTextModel()}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages, max_tokens: maxTokens, stream: true }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    throw new Error(`cloudflare stream failed (${upstream.status}): ${detail.slice(0, 200)}`);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const source = upstream.body;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader();
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newline = buffer.indexOf("\n");
          while (newline >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf("\n");
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload) as { response?: string };
              if (typeof parsed.response === "string" && parsed.response.length > 0) {
                controller.enqueue(encoder.encode(parsed.response));
              }
            } catch {
              // अधूरी या गलत लाइन छोड़ दें; अगला टुकड़ा सही आएगा
            }
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      return source.cancel(reason);
    },
  });
}