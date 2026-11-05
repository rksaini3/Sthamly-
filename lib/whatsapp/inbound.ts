import { getPublicEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendText } from "@/lib/whatsapp/client";

export interface InboundMessage {
  waMessageId: string;
  from: string;
  type: string;
  text: string | null;
  imageId: string | null;
  imageCaption: string | null;
  timestamp: string;
}

// Postgres का unique violation code
const UNIQUE_VIOLATION = "23505";

type Command = "help" | "stop" | "delete" | null;

const HELP_TEXT = [
  "Sthamly: उपलब्ध कमांड",
  "",
  "• मदद: यह सूची",
  "• STOP या रोको: संदेश बंद करें",
  "• डेटा हटाओ: अपना डेटा हटवाने का अनुरोध",
  "",
  "नया ऑफर भेजने के लिए बस ऑफर लिखें, जैसे:",
  "1 किलो काजू कतली ₹600",
].join("\n");

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
  return null;
}

function onboardingText(): string {
  const appUrl = getPublicEnv().NEXT_PUBLIC_APP_URL;
  return [
    "नमस्ते! Sthamly पर अपनी दुकान का पोस्टर और रील बनवाने के लिए यहां से शुरू करें:",
    `${appUrl}/onboarding`,
  ].join("\n");
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

  // 4. कमांड
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

    await sendText(message.from, "ठीक है, अब से हम संदेश नहीं भेजेंगे। वापस जुड़ना हो तो 'मदद' लिखें।");
    return;
  }

  if (command === "delete") {
    // TODO: deletion_requests table बनने पर यहां रिकॉर्ड करें (docs/COMPLIANCE.md देखें)
    await sendText(
      message.from,
      "आपका डेटा हटाने का अनुरोध दर्ज हो गया है। हमारी टीम आपसे संपर्क करेगी।",
    );
    return;
  }

  // 5. सामान्य संदेश (अभी सिर्फ पहचान और पुष्टि; पोस्टर बनाना अगली फाइल में)
  if (message.type === "image") {
    await sendText(
      message.from,
      "फोटो मिल गई। अब ऑफर लिखकर भेजें, जैसे: 1 किलो काजू कतली ₹600",
    );
    return;
  }

  if (message.type === "text" && message.text) {
    await sendText(
      message.from,
      "ऑफर नोट कर लिया है। पोस्टर बनाने की सुविधा अभी तैयार हो रही है।",
    );
    return;
  }

  // 6. बाकी प्रकार (audio, sticker आदि): मदद दिखाएं, चुप न रहें
  await sendText(message.from, HELP_TEXT);
}