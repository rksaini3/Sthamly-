import { getAIProvider } from "@/lib/ai";
import { logCost } from "@/lib/cost";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM = [
  "तुम Sthamly असिस्टेंट हो। तुम छोटे दुकानदारों (मिठाई, सैलून, कोचिंग, क्लिनिक) के सहायक हो।",
  "हिंदी में, सरल और छोटे वाक्यों में जवाब दो। ज़रूरत हो तो हिंग्लिश चलेगा।",
  "सवाल का सीधा जवाब दो। दुकान के पोस्टर, ऑफर, प्रचार और घोषणा में मदद करो।",
  "अगर किसी बात की जानकारी न हो, तो साफ़ कहो कि पता नहीं। कुछ मत बनाओ।",
  "नाम पूछे जाने पर कहो कि तुम Sthamly असिस्टेंट हो।",
].join("\n");

function buildPrompt(history: ChatTurn[]): string {
  const lines = history.map((t) => `${t.role === "user" ? "दुकानदार" : "असिस्टेंट"}: ${t.content}`);
  return [SYSTEM, "", "बातचीत:", ...lines, "असिस्टेंट:"].join("\n");
}

/** बातचीत का अगला जवाब। आखिरी संदेश दुकानदार का होना चाहिए। */
export async function replyToChat(history: ChatTurn[]): Promise<string> {
  const provider = getAIProvider();
  const result = await provider.generateText({ prompt: buildPrompt(history), maxTokens: 800 });

  await logCost({
    step: "voice",
    provider: provider.name,
    model: "chat",
    costPaise: result.costPaise,
  });

  return (result.text ?? "").trim().replace(/^असिस्टेंट:\s*/, "");
}