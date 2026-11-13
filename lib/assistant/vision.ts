import { logCost } from "@/lib/cost";
import { getServerEnv } from "@/lib/env";
import type { Lang } from "@/lib/i18n";

// लाइव कैमरा: कैमरे की एक तस्वीर और दुकानदार का सवाल मिलाकर जवाब।
// Groq के vision model से (वही GROQ_API_KEY)। मॉडल बदलना हो तो GROQ_VISION_MODEL सेट करें।
const BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const TIMEOUT_MS = 30_000;
// अंदाज़ा: एक तस्वीर वाले सवाल का खर्च (paise)। असली हिसाब मिलने पर यहाँ सुधारें।
const COST_PER_ASK_PAISE = 30;

export interface LiveTurn {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_HI = [
  "तुम Sthamly हो। दुकानदार अपने फ़ोन का कैमरा दिखाकर तुमसे लाइव बात कर रहा है।",
  "तस्वीर में जो सच में दिख रहा है, सिर्फ़ उसी के आधार पर जवाब दो।",
  "जवाब बोलकर सुनाया जाएगा, इसलिए 2 से 3 छोटे वाक्य, सादी हिंदी में। कोई सूची, तारे या इमोजी नहीं।",
  "तस्वीर धुंधली या अधूरी हो तो साफ़ कहो और कैमरा कैसे पकड़ना है बताओ।",
  "दाम, ब्रांड या मात्रा अंदाज़े से मत बताओ। जो लिखा दिख रहा हो वही पढ़ो।",
  "किसी इंसान की पहचान मत बताओ।",
  "अगर दुकानदार पोस्टर या ऑफ़र चाहता है, तो दिख रही चीज़ के हिसाब से एक छोटा ऑफ़र सुझाओ।",
  "नाम पूछे जाने पर कहो कि तुम Sthamly हो। खुद को असिस्टेंट, बॉट या AI मॉडल का नाम मत दो।",
].join("\n");

const SYSTEM_EN = [
  "You are Sthamly. A shopkeeper is showing you their phone camera and talking to you live.",
  "Answer only from what is truly visible in the picture.",
  "Your answer will be spoken aloud, so use 2 to 3 short, simple sentences. No lists, asterisks or emoji.",
  "If the picture is blurry or cut off, say so plainly and tell them how to hold the camera.",
  "Do not guess prices, brands or quantities. Read only what is written.",
  "Never identify any person.",
  "If the shopkeeper wants a poster or an offer, suggest one short offer based on what you can see.",
  "If asked your name, say you are Sthamly. Do not call yourself an assistant or name any AI model.",
].join("\n");

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[];
}

export async function askAboutImage(input: {
  imageDataUrl: string;
  text: string;
  history: LiveTurn[];
  lang: Lang;
}): Promise<string> {
  const { GROQ_API_KEY } = getServerEnv();
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY सेट नहीं है");
  const model = process.env.GROQ_VISION_MODEL ?? DEFAULT_VISION_MODEL;

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      temperature: 0.4,
      messages: [
        { role: "system", content: input.lang === "en" ? SYSTEM_EN : SYSTEM_HI },
        ...input.history.map((h) => ({ role: h.role, content: h.content })),
        {
          role: "user",
          content: [
            { type: "text", text: input.text },
            { type: "image_url", image_url: { url: input.imageDataUrl } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`vision request failed (${res.status}) ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as ChatResponse;
  const reply = (data.choices?.[0]?.message?.content ?? "").trim();

  await logCost({ step: "other", provider: "groq", model, costPaise: COST_PER_ASK_PAISE, meta: { feature: "live" } });

  return reply.replace(/^(Sthamly|असिस्टेंट|Assistant):\s*/, "");
}