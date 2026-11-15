import { getAIProvider } from "@/lib/ai";
import { logCost } from "@/lib/cost";
import type { Lang } from "@/lib/i18n";
import { packFor } from "@/lib/packs";
import { guardReply } from "@/lib/packs/types";
import type { Role } from "@/types/domain";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// डिफ़ॉल्ट (दुकानदार और बिना pack वाली भूमिकाएं)
const SYSTEM_HI = [
  "तुम Sthamly हो। तुम छोटे दुकानदारों (मिठाई, सैलून, कोचिंग, क्लिनिक) के सहायक हो।",
  "user जिस भाषा और लिपि में लिखे (हिंदी, हिंग्लिश या English), जवाब उसी में दो। साफ़ न हो तो हिंग्लिश। सरल और छोटे वाक्य रखो।",
  "सवाल का सीधा जवाब दो। दुकान के पोस्टर, ऑफर, प्रचार और घोषणा में मदद करो।",
  "जो बात पक्की पता न हो (जैसे आज के बाज़ार या ट्रेंड की ताज़ा जानकारी), उसे अंदाज़े से मत बताओ। साफ़ कहो कि ताज़ा जानकारी तुम्हारे पास नहीं है, और जो सामान्य बात पता है वह बताओ।",
  "नाम पूछे जाने पर कहो कि तुम Sthamly हो। खुद को असिस्टेंट, बॉट या AI मॉडल का नाम मत दो।",
].join("\n");

const SYSTEM_EN = [
  "You are Sthamly. You help small shopkeepers (sweet shops, salons, coaching centres, clinics).",
  "Reply in the same language and script the user writes in (Hindi, Hinglish or English). If it is unclear, use Hinglish. Keep sentences short and simple.",
  "Answer the question directly. Help with shop posters, offers, promotion and announcements.",
  "If you are not sure of something (for example today's market or trend information), do not guess. Say plainly that you do not have current information, and share only the general knowledge you are sure of.",
  "If asked your name, say you are Sthamly. Do not call yourself an assistant or name any AI model.",
].join("\n");

// सिस्टम प्रॉम्प्ट: भूमिका का pack हो तो उसका persona, वरना डिफ़ॉल्ट
function systemText(lang: Lang, role: Role | null | undefined): string {
  const pack = packFor(role);
  if (pack) return pack.persona[lang].join("\n");
  return lang === "en" ? SYSTEM_EN : SYSTEM_HI;
}

function buildPrompt(history: ChatTurn[], lang: Lang, system: string, packed: boolean): string {
  const en = lang === "en";
  // pack वाली बातचीत में "दुकानदार" की जगह सामान्य "उपयोगकर्ता"
  const userLabel = packed ? (en ? "User" : "उपयोगकर्ता") : en ? "Shopkeeper" : "दुकानदार";
  const lines = history.map((t) => {
    const who = t.role === "user" ? userLabel : "Sthamly";
    return `${who}: ${t.content}`;
  });
  return [system, "", en ? "Conversation:" : "बातचीत:", ...lines, "Sthamly:"].join("\n");
}

/**
 * बातचीत का अगला जवाब। आखिरी संदेश user का होना चाहिए।
 * भाषा: user जिस भाषा में लिखे, उसी में जवाब (lang सिर्फ़ तब काम आता है जब साफ़ न हो)।
 * role दिया हो और उसका pack हो, तो pack का persona लगेगा और जवाब guardReply से गुज़रेगा
 * (जिसमें हमेशा pack की सूचना जुड़ती है)।
 */
export async function replyToChat(
  history: ChatTurn[],
  lang: Lang = "hi",
  role: Role | null = null,
): Promise<string> {
  const pack = packFor(role);
  const provider = getAIProvider();
  const result = await provider.generateText({
    prompt: buildPrompt(history, lang, systemText(lang, role), pack !== null),
    maxTokens: 800,
  });

  await logCost({
    step: "voice",
    provider: provider.name,
    model: "chat",
    costPaise: result.costPaise,
  });

  const text = (result.text ?? "").trim().replace(/^(Sthamly|असिस्टेंट|Assistant):\s*/, "");

  // खाली जवाब पर सूचना न जोड़ें; pack हो तो हर जवाब की जांच और सूचना
  if (!pack || text.length === 0) return text;
  return guardReply(pack, text, lang).text;
}