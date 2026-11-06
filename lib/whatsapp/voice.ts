import { z } from "zod";
import { getAIProvider } from "@/lib/ai";
import { logCost } from "@/lib/cost";
import { createJob } from "@/lib/jobs/create";
import { sendText } from "@/lib/whatsapp/client";
import { takePendingPhoto } from "@/lib/whatsapp/conversation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { saveVoiceNote } from "@/lib/voice/download";
import { parseOfferFromText } from "@/lib/voice/parse";
import type { Json } from "@/types/database";

// पुष्टि के लिए कितनी देर तक ऑफर याद रखें
const OFFER_TTL_MS = 10 * 60 * 1000;

const pendingOfferSchema = z.object({
  userId: z.string().uuid(),
  shopId: z.string().uuid(),
  offerText: z.string().min(3).max(300),
  occasion: z.string().max(60).nullable(),
});

export type PendingOffer = z.infer<typeof pendingOfferSchema>;

const YES_WORDS = ["हां", "हाँ", "हां जी", "हाँ जी", "ठीक है", "haan", "han", "ha", "yes", "y", "ok"];
const NO_WORDS = ["नहीं", "nahi", "nahin", "no", "n", "रद्द"];

/** "हां" या "नहीं" पहचानें। कुछ और हो तो null। */
export function parseYesNo(text: string): "yes" | "no" | null {
  const t = text.trim().toLowerCase();
  if (YES_WORDS.includes(t)) return "yes";
  if (NO_WORDS.includes(t)) return "no";
  return null;
}

async function setPendingOffer(phone: string, offer: PendingOffer): Promise<void> {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const { error } = await admin.from("conversations").upsert(
    {
      phone,
      pending_offer: offer as unknown as Json,
      pending_offer_at: now,
      updated_at: now,
    },
    { onConflict: "phone" },
  );
  if (error) throw error;
}

// पढ़ते ही साफ़ करें, ताकि एक ऑफर दो बार न बने
async function takePendingOffer(phone: string): Promise<PendingOffer | null> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("conversations")
    .select("pending_offer, pending_offer_at")
    .eq("phone", phone)
    .maybeSingle();
  if (error) throw error;
  if (!data?.pending_offer || !data.pending_offer_at) return null;

  const { error: clearError } = await admin
    .from("conversations")
    .update({
      pending_offer: null,
      pending_offer_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("phone", phone);
  if (clearError) throw clearError;

  if (Date.now() - new Date(data.pending_offer_at).getTime() > OFFER_TTL_MS) {
    return null;
  }

  const parsed = pendingOfferSchema.safeParse(data.pending_offer);
  return parsed.success ? parsed.data : null;
}

// Phone से user और उसकी पहली दुकान
async function findShopForPhone(phone: string): Promise<{ userId: string; shopId: string } | null> {
  const admin = createSupabaseAdminClient();

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return null;

  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("id")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (shopError) throw shopError;
  if (!shop) return null;

  return { userId: profile.id, shopId: shop.id };
}

async function transcribeVoice(signedUrl: string): Promise<string> {
  const provider = getAIProvider();
  const result = await provider.transcribe({ audioUrl: signedUrl, language: "hi" });

  await logCost({
    step: "voice",
    provider: provider.name,
    model: "whisper",
    costPaise: result.costPaise,
  });

  return result.text ?? "";
}

/**
 * वॉइस नोट आने पर: download, समझना, और पुष्टि मांगना।
 * पोस्टर यहां नहीं बनता, "हां" आने के बाद बनता है।
 */
export async function handleVoiceNote(phone: string, mediaId: string): Promise<void> {
  const found = await findShopForPhone(phone);
  if (!found) {
    await sendText(phone, "पहले वेब पर अपनी दुकान बनाएं: sthamly.com");
    return;
  }

  const voice = await saveVoiceNote(found.userId, mediaId);
  const text = await transcribeVoice(voice.signedUrl);

  if (!text) {
    await sendText(phone, "आवाज़ साफ़ सुनाई नहीं दी। दोबारा भेजें, या लिखकर भेजें।");
    return;
  }

  const offer = await parseOfferFromText(text);
  if (!offer) {
    await sendText(
      phone,
      `समझ नहीं आया। आपने कहा: "${text}"\nऑफर लिखकर भेजें, जैसे: काजू कतली 10% ऑफ`,
    );
    return;
  }

  const pending: PendingOffer = {
    userId: found.userId,
    shopId: found.shopId,
    offerText: offer.offerText,
    occasion: offer.occasion,
  };
  await setPendingOffer(phone, pending);

  await sendText(
    phone,
    [
      "यह लिखूं?",
      `ऑफर: ${pending.offerText}`,
      `मौका: ${pending.occasion ?? "कोई नहीं"}`,
      "",
      '"हां" लिखें तो पोस्टर बनेगा। "नहीं" लिखें तो रद्द।',
    ].join("\n"),
  );
}

/**
 * "हां" या "नहीं" का जवाब।
 * लौटाता है: true अगर संदेश इसी से संभल गया, false अगर सामान्य संदेश की तरह आगे बढ़ाना है।
 */
export async function handleOfferReply(phone: string, text: string): Promise<boolean> {
  const answer = parseYesNo(text);
  if (!answer) return false;

  const offer = await takePendingOffer(phone);
  if (!offer) return false;

  if (answer === "no") {
    await sendText(phone, "ठीक है, रद्द कर दिया।");
    return true;
  }

  const photo = await takePendingPhoto(phone);
  if (!photo) {
    // फोटो नहीं है: ऑफर वापस रखें, ताकि फोटो आने के बाद फिर "हां" लिखा जा सके
    await setPendingOffer(phone, offer);
    await sendText(phone, "पहले दुकान की फोटो भेजें, फिर 'हां' लिखें।");
    return true;
  }

  const result = await createJob({
    userId: offer.userId,
    shopId: offer.shopId,
    offerText: offer.offerText,
    occasion: offer.occasion,
    photoPaths: [photo],
    language: "hinglish",
    wantReel: false,
  });

  if (!result.ok) {
    await sendText(phone, "पोस्टर का काम शुरू नहीं हो पाया। थोड़ी देर बाद दोबारा कोशिश करें।");
    return true;
  }

  await sendText(phone, "पोस्टर बन रहा है। कुछ मिनट में यहीं भेजा जाएगा।");
  return true;
}