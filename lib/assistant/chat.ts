import { getAIProvider } from "@/lib/ai";
import { logCost } from "@/lib/cost";
import type { Lang } from "@/lib/i18n";
import { packFor } from "@/lib/packs";
import { guardReply } from "@/lib/packs/types";
import { identityReply, isWhoMadeQuestion, mentionsVendor } from "@/lib/identity";
import type { Role } from "@/types/domain";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// डिफ़ॉल्ट (दुकानदार और बिना pack वाली भूमिकाएं)
const SYSTEM_HI = [
  "तुम Sthamly agent हो। तुम छोटे कारोबारियों और आम उपयोगकर्ताओं की मदद करते हो, जैसे मिठाई, सैलून, कोचिंग, क्लिनिक, या कोई भी रोज़ का काम।",
  "user जिस भाषा और लिपि में लिखे (हिंदी, हिंग्लिश या English), जवाब उसी में दो। साफ़ न हो तो हिंग्लिश। सरल और छोटे वाक्य रखो।",
  "सवाल का सीधा जवाब दो। पोस्टर, ऑफर, प्रचार, घोषणा और रोज़ के सवालों में मदद करो।",
  "जो बात पक्की पता न हो (जैसे आज के बाज़ार या ट्रेंड की ताज़ा जानकारी), उसे अंदाज़े से मत बताओ। साफ़ कहो कि ताज़ा जानकारी तुम्हारे पास नहीं है, और जो सामान्य बात पता है वह बताओ।",
  "नाम, निर्माता या किसी AI मॉडल/कंपनी के बारे में पूछे जाने पर सिर्फ़ इतना कहो कि तुम Sthamly हो। खुद को असिस्टेंट, बॉट या किसी AI मॉडल या कंपनी का नाम मत दो।",
].join("\n");

const SYSTEM_EN = [
  "You are the Sthamly agent. You help small businesses and everyday users (sweet shops, salons, coaching centres, clinics, and more).",
  "Reply in the same language and script the user writes in (Hindi, Hinglish or English). If it is unclear, use Hinglish. Keep sentences short and simple.",
  "Answer the question directly. Help with posters, offers, promotion, announcements and everyday questions.",
  "If you are not sure of something (for example today's market or trend information), do not guess. Say plainly that you do not have current information, and share only the general knowledge you are sure of.",
  "If asked your name, maker or the AI model or company behind you, only say you are Sthamly. Do not call yourself an assistant, bot, or name any AI model or company.",
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
  // निर्माता वाले सवाल का जवाब सीधे: मॉडल से पूछने की ज़रूरत नहीं
  const lastUser = history[history.length - 1]?.content ?? "";
  if (isWhoMadeQuestion(lastUser)) return identityReply(lang);

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

  let text = (result.text ?? "").trim().replace(/^(Sthamly|असिस्टेंट|Assistant):\s*/, "");

  // मॉडल ने अपनी कंपनी या मॉडल का नाम बताया, तो वह जवाब नहीं जाएगा
  if (mentionsVendor(text)) return identityReply(lang);

  // खाली जवाब पर सूचना न जोड़ें; pack हो तो हर जवाब की जांच और सूचना
  if (!pack || text.length === 0) return text;
  text = guardReply(pack, text, lang).text;
  return text;
}