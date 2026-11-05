import { getServerEnv } from "@/lib/env";

const GRAPH_VERSION = "v21.0"; // Meta की ताज़ा version चेक करें

// Storage bucket की सीमा (supabase/config.toml में 10MiB) से मेल खाती है
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// सिर्फ ये फोटो स्वीकार होंगी
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

interface SendResult {
  messageId: string | null;
}

export interface DownloadedImage {
  data: Buffer;
  mimeType: string;
  sizeBytes: number;
}

interface MediaInfo {
  url: string;
  mime_type: string;
  file_size?: number;
}

async function graphPost(body: Record<string, unknown>): Promise<SendResult> {
  const env = getServerEnv();
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhatsApp send failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { messages?: { id: string }[] };
  return { messageId: json.messages?.[0]?.id ?? null };
}

/** सादा text भेजें (customer service window के अंदर) */
export function sendText(to: string, body: string): Promise<SendResult> {
  return graphPost({ to, type: "text", text: { body } });
}

/** Template message भेजें (window के बाहर या पहली बार) */
export function sendTemplate(
  to: string,
  name: string,
  languageCode: string,
  params: string[] = [],
): Promise<SendResult> {
  return graphPost({
    to,
    type: "template",
    template: {
      name,
      language: { code: languageCode },
      components: params.length
        ? [
            {
              type: "body",
              parameters: params.map((text) => ({ type: "text", text })),
            },
          ]
        : [],
    },
  });
}

/** Image भेजें (public HTTPS URL से) */
export function sendImage(
  to: string,
  link: string,
  caption?: string,
): Promise<SendResult> {
  return graphPost({
    to,
    type: "image",
    image: { link, ...(caption ? { caption } : {}) },
  });
}

/**
 * WhatsApp पर आई फोटो download करें।
 *
 * Meta दो कदम में देता है:
 * 1. media id से temporary URL और metadata
 * 2. उस URL से असली फाइल (यह भी Bearer token मांगता है)
 *
 * URL कुछ मिनट में expire हो जाता है, इसलिए इसे तुरंत download करें।
 */
export async function downloadImage(mediaId: string): Promise<DownloadedImage> {
  const { WHATSAPP_ACCESS_TOKEN } = getServerEnv();
  const auth = { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` };

  // Step 1: metadata
  const infoRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: auth,
  });
  if (!infoRes.ok) {
    throw new Error(`WhatsApp media info failed (${infoRes.status})`);
  }
  const info = (await infoRes.json()) as MediaInfo;

  if (!ALLOWED_IMAGE_TYPES.includes(info.mime_type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    throw new Error(`unsupported image type: ${info.mime_type}`);
  }
  if (info.file_size && info.file_size > MAX_IMAGE_BYTES) {
    throw new Error(`image too large: ${info.file_size} bytes`);
  }

  // Step 2: असली फाइल
  const fileRes = await fetch(info.url, { headers: auth });
  if (!fileRes.ok) {
    throw new Error(`WhatsApp media download failed (${fileRes.status})`);
  }

  const arrayBuffer = await fileRes.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`image too large after download: ${arrayBuffer.byteLength} bytes`);
  }

  return {
    data: Buffer.from(arrayBuffer),
    mimeType: info.mime_type,
    sizeBytes: arrayBuffer.byteLength,
  };
}