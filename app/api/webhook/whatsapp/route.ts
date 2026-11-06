import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { handleInboundMessage, type InboundMessage } from "@/lib/whatsapp/inbound";
import { verifyWhatsAppSignature } from "@/lib/whatsapp/verify";

export const runtime = "nodejs";

// ---- Meta का payload (सिर्फ वो हिस्सा जो हम इस्तेमाल करते हैं) ----

const messageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  image: z
    .object({
      id: z.string(),
      mime_type: z.string(),
      caption: z.string().optional(),
    })
    .optional(),
  audio: z
    .object({
      id: z.string(),
      mime_type: z.string(),
      voice: z.boolean().optional(),
    })
    .optional(),
});

const payloadSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            metadata: z.object({ phone_number_id: z.string() }),
            messages: z.array(messageSchema).optional(),
          }),
        }),
      ),
    }),
  ),
});

// ---- GET: Meta की webhook verification ----

export function GET(req: NextRequest) {
  const { WHATSAPP_VERIFY_TOKEN } = getServerEnv();
  const params = req.nextUrl.searchParams;

  if (
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === WHATSAPP_VERIFY_TOKEN
  ) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

// ---- POST: आने वाले messages ----
//
// नियम:
// 1. Signature गलत हो तो 401 (नकली request)
// 2. Payload समझ न आए तो भी 200 (Meta बार-बार retry करेगा, जो बेकार है)
// 3. जवाब तुरंत लौटाएं, असली काम after() में चलता है

export async function POST(req: NextRequest) {
  // Signature raw body पर बनता है, इसलिए JSON.parse से पहले पढ़ें
  const rawBody = await req.text();

  if (!verifyWhatsAppSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, skipped: "invalid_json" });
  }

  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    // Status updates जैसे events भी यहीं आते हैं, इन्हें छोड़ देना सही है
    return NextResponse.json({ ok: true, skipped: "unsupported_payload" });
  }

  const { WHATSAPP_PHONE_NUMBER_ID } = getServerEnv();

  const messages: InboundMessage[] = [];
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;

      // दूसरे phone number का payload हमारे पास नहीं होना चाहिए
      if (change.value.metadata.phone_number_id !== WHATSAPP_PHONE_NUMBER_ID) continue;

      for (const message of change.value.messages ?? []) {
        messages.push({
          waMessageId: message.id,
          from: message.from,
          type: message.type,
          text: message.text?.body ?? null,
          imageId: message.image?.id ?? null,
          imageCaption: message.image?.caption ?? null,
          audioId: message.audio?.id ?? null,
          timestamp: message.timestamp,
        });
      }
    }
  }

  // जवाब जाने के बाद प्रोसेस करें। Meta को तुरंत 200 मिल जाता है।
  if (messages.length > 0) {
    after(async () => {
      for (const message of messages) {
        try {
          await handleInboundMessage(message);
        } catch (error) {
          // एक message की गलती बाकी messages को न रोके
          console.error("whatsapp inbound failed", message.waMessageId, error);
        }
      }
    });
  }

  return NextResponse.json({ ok: true, received: messages.length });
}