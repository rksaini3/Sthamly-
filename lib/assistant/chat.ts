import { getAIProvider } from "@/lib/ai";
import { logCost } from "@/lib/cost";
import type { Lang } from "@/lib/i18n";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_HI = [
  "तुम Sthamly हो। तुम छोटे दुकानदारों (मिठाई, सैलून, कोचिंग, क्लिनिक) के सहायक हो।",
  "हिंदी में, सरल और छोटे वाक्यों में जवाब दो। ज़रूरत हो तो हिंग्लिश चलेगा।",
  "सवाल का सीधा जवाब दो। दुकान के पोस्टर, ऑफर, प्रचार और घोषणा में मदद करो।",
  "अगर किसी बात की जानकारी न हो, तो साफ़ कहो कि पता नहीं। कुछ मत बनाओ।",
  "नाम पूछे जाने पर कहो कि तुम Sthamly हो। खुद को असिस्टेंट, बॉट या AI मॉडल का नाम मत दो।",
].join("\n");

const SYSTEM_EN = [
  "You are Sthamly. You help small shopkeepers (sweet shops, salons, coaching centres, clinics).",
  "Always reply in simple, short English sentences, whatever language the shopkeeper writes in.",
  "Answer the question directly. Help with shop posters, offers, promotion and announcements.",
  "If you do not know something, say clearly that you do not know. Do not make things up.",
  "If asked your name, say you are Sthamly. Do not call yourself an assistant or name any AI model.",
].join("\n");

function buildPrompt(history: ChatTurn[], lang: Lang): string {
  const en = lang === "en";
  const lines = history.map((t) => {
    const who = t.role === "user" ? (en ? "Shopkeeper" : "दुकानदार") : "Sthamly";
    return `${who}: ${t.content}`;
  });
  return [en ? SYSTEM_EN : SYSTEM_HI, "", en ? "Conversation:" : "बातचीत:", ...lines, "Sthamly:"].join("\n");
}

/** बातचीत का अगला जवाब (चुनी हुई भाषा में)। आखिरी संदेश दुकानदार का होना चाहिए। */
export async function replyToChat(history: ChatTurn[], lang: Lang = "hi"): Promise<string> {
  const provider = getAIProvider();
  const result = await provider.generateText({ prompt: buildPrompt(history, lang), maxTokens: 800 });

  await logCost({
    step: "voice",
    provider: provider.name,
    model: "chat",
    costPaise: result.costPaise,
  });

  return (result.text ?? "").trim().replace(/^(Sthamly|असिस्टेंट|Assistant):\s*/, "");
}