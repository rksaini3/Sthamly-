import { eraseUserData } from "@/lib/account/erase";
import { createJob } from "@/lib/jobs/create";
import { getPublicEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  setPendingAction,
  setPendingPhoto,
  takePendingAction,
  takePendingPhoto,
} from "@/lib/whatsapp/conversation";
import { sendText } from "@/lib/whatsapp/client";
import { saveWhatsAppPhoto, UnsupportedPhotoError } from "@/lib/whatsapp/photo";
import { handleOfferReply, handleVoiceNote } from "@/lib/whatsapp/voice";

export interface InboundMessage {
  waMessageId: string;
  from: string;
  type: string;
  text: string | null;
  imageId: string | null;
  imageCaption: string | null;
  audioId: string | null;
  timestamp: string;
}

// Postgres का unique violation code
const UNIQUE_VIOLATION = "23505";

type Command = "help" | "stop" | "delete" | "confirm_delete" | null;

const HELP_TEXT = [
  "Sthamly: उपलब्ध कमांड",
  "",
  "• मदद: यह सूची",
  "• STOP या रोको: संदेश बंद करें",
  "• डेटा हटाओ: अपना पूरा डेटा हटवाएं",
  "",
  "पोस्टर के लिए: पहले दुकान की फोटो भेजें, फिर ऑफर लिखें, जैसे:",
  "1 किलो काजू कतली ₹600",
  "",
  "या वॉइस नोट भेजें, जैसे: \"कल दिवाली पर काजू कतली 10% ऑफ\"",
].join("\n");

const CONFIRM_DELETE_TEXT = [
  "पक्का करें: आपकी दुकान, फोटो, पोस्टर और खाता हमेशा के लिए हट जाएंगे।",
  "",
  "अगर पक्का है तो 10 मिनट में \"हां हटाओ\" लिखें।",
  "कुछ और लिखने पर यह अनुरोध रद्द हो जाएगा।",
].join("\n");

const DELETED_TEXT =
  "आपका डेटा हटा दिया गया है। Sthamly फिर से इस्तेमाल करने के लिए नए सिरे से शुरू करें।";

function normalizePhone(raw: string): string {
  // Meta देता है "919876543210" (सिर्फ अंक, बिना +)। हम वही रखते हैं।
  return raw.replace(/\D/g, "");
}

function parseCommand(text: string | null): Command {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (t === "मदद" || t === "help") return "help";
  if (t === "stop" || t === "रोको") return "stop";
  if (t === "डेटा हटाओ" || t === "delete") return "delete";
  if (t === "हां हटाओ" || t === "हाँ हटाओ" || t === "yes delete") return "confirm_delete";
  return null;
}

function onboardingText(): string {
  const appUrl = getPublicEnv().NEXT_PUBLIC_APP_URL;
  return [
    "नमस्ते! Sthamly पर अपनी दुकान का पोस्टर बनवाने के लिए यहां से शुरू करें:",
    `${appUrl}/onboarding`,
  ].join("\n");
}

// यूज़र की पहली दुकान (अभी एक ही दुकान का चलन है)
async function primaryShopId(userId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("shops")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

// फोटो के बाद आया ऑफर: फोटो और ऑफर जोड़कर पोस्टर का job बनाना
async function handleOffer(message: InboundMessage, userId: string): Promise<void> {
  const phone = normalizePhone(message.from);
  const appUrl = getPublicEnv().NEXT_PUBLIC_APP_URL;
  const offerText = (message.text ?? "").trim();

  if (offerText.length < 3 || offerText.length > 300) {
    await sendText(message.from, "ऑफर 3 से 300 अक्षरों में लिखें, जैसे: 1 किलो काजू कतली ₹600");
    return;
  }

  const shopId = await primaryShopId(userId);
  if (!shopId) {
    await sendText(message.from, `पहले दुकान बनाएं: ${appUrl}/onboarding`);
    return;
  }

  const photoPath = await takePendingPhoto(phone);
  if (!photoPath) {
    await sendText(message.from, "पहले दुकान की फोटो भेजें, फिर ऑफर लिखें।");
    return;
  }

  const result = await createJob({
    userId,
    shopId,
    offerText,
    photoPaths: [photoPath],
    language: "hinglish",
    wantReel: false,
  });

  if (!result.ok) {
    if (result.code === "QUOTA_EXCEEDED") {
      // फोटो वापस रख दें, ताकि कोटा बढ़ने के बाद उसी फोटो से दोबारा भेज सकें
      await setPendingPhoto(phone, photoPath);
      await sendText(
        message.from,
        `इस महीने का पोस्टर कोटा खत्म हो गया है। प्लान देखें: ${appUrl}/pricing`,
      );
      return;
    }
    await sendText(message.from, "पोस्टर शुरू नहीं हो पाया। थोड़ी देर बाद फिर से ऑफर भेजें।");
    return;
  }

  await sendText(message.from, "ठीक है, पोस्टर बन रहा है। कुछ मिनट में यहीं भेज देंगे।");
}

/**
 * एक inbound WhatsApp message को संभालें।
 * यह `after()` में चलता है, इसलिए यहां गलती होने पर route पर असर नहीं पड़ता।
 */
export async function handleInboundMessage(message: InboundMessage): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const phone = normalizePhone(message.from);

  // 1. Duplicate जांच: wa_message_id primary key है।
  //    Meta retry करे तो insert पर unique violation आएगा, तब कुछ न करें।
  const { error: dedupeError } = await supabase
    .from("processed_messages")
    .insert({ wa_message_id: message.waMessageId, from_phone: phone });

  if (dedupeError) {
    if (dedupeError.code === UNIQUE_VIOLATION) return;
    throw dedupeError;
  }

  // 2. यूज़र पहचानें (phone से profile)
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (profileError) throw profileError;

  const command = parseCommand(message.text);

  // 3. अनजान नंबर
  if (!profile) {
    // STOP भेजने वाले को बिना रजिस्टर हुए भी कोई मैसेज नहीं भेजना है
    if (command === "stop") return;
    await sendText(message.from, onboardingText());
    return;
  }

  // 4. लंबित कार्रवाई (जैसे "डेटा हटाओ" की पुष्टि) लें। हर नया संदेश उसे बंद करता है।
  const pendingAction = await takePendingAction(phone);

  // 5. कमांड
  if (command === "help") {
    await sendText(message.from, HELP_TEXT);
    return;
  }

  if (command === "stop") {
    const { error } = await supabase
      .from("consents")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", profile.id)
      .eq("purpose", "whatsapp_messages")
      .is("revoked_at", null);
    if (error) throw error;

    await sendText(
      message.from,
      "ठीक है, अब से हम संदेश नहीं भेजेंगे। वापस जुड़ना हो तो 'मदद' लिखें।",
    );
    return;
  }

  if (command === "delete") {
    await setPendingAction(phone, "erase");
    await sendText(message.from, CONFIRM_DELETE_TEXT);
    return;
  }

  if (command === "confirm_delete") {
    if (pendingAction !== "erase") {
      await sendText(message.from, "कोई हटाने का अनुरोध नहीं है। पहले \"डेटा हटाओ\" लिखें।");
      return;
    }

    try {
      await eraseUserData(profile.id, phone);
      await sendText(message.from, DELETED_TEXT);
    } catch (err) {
      console.error("inbound: erase failed", err);
      await sendText(
        message.from,
        "डेटा हटाने में दिक्कत आई। थोड़ी देर बाद \"डेटा हटाओ\" दोबारा लिखें।",
      );
    }
    return;
  }

  // 6. फोटो: सहेजें और ऑफर का इंतज़ार करें
  if (message.type === "image" && message.imageId) {
    try {
      const photoPath = await saveWhatsAppPhoto(profile.id, message.imageId);
      await setPendingPhoto(phone, photoPath);
    } catch (err) {
      if (err instanceof UnsupportedPhotoError) {
        await sendText(message.from, "फोटो JPG या PNG में भेजें, please।");
        return;
      }
      // बाकी गलतियां (download, storage) लॉग में जाएं और यूज़र को सादा संदेश मिले
      console.error("inbound: photo save failed", err);
      await sendText(message.from, "फोटो सेव नहीं हो पाई। थोड़ी देर बाद दोबारा भेजें।");
      return;
    }

    await sendText(
      message.from,
      "फोटो मिल गई। अब ऑफर लिखकर भेजें, जैसे: 1 किलो काजू कतली ₹600",
    );
    return;
  }

  // 7. वॉइस नोट: समझकर पुष्टि मांगें (पोस्टर "हां" के बाद बनेगा)
  if (message.type === "audio" && message.audioId) {
    try {
      await handleVoiceNote(phone, message.audioId);
    } catch (err) {
      console.error("inbound: voice failed", err);
      await sendText(
        message.from,
        "आवाज़ प्रोसेस नहीं हो पाई। थोड़ी देर बाद दोबारा भेजें, या लिखकर भेजें।",
      );
    }
    return;
  }

  // 8. Text: पहले देखें कि यह "हां" या "नहीं" का जवाब तो नहीं, फिर ऑफर मानें
  if (message.type === "text" && message.text) {
    const handledAsReply = await handleOfferReply(phone, message.text);
    if (handledAsReply) return;

    await handleOffer(message, profile.id);
    return;
  }

  // 9. बाकी प्रकार (sticker आदि): मदद दिखाएं, चुप न रहें
  await sendText(message.from, HELP_TEXT);
}