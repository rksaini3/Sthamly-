import { logCost } from "@/lib/cost";
import type { Lang } from "@/lib/i18n";

// लाइव कैमरा: कैमरे की एक तस्वीर और दुकानदार का सवाल मिलाकर जवाब।
// Gemini के generateContent से (वही GEMINI_API_KEY जो लाइव के लिए पहले से है)।
// Groq का vision model बंद हो चुका है, इसलिए उसे हटाया गया है।
// मॉडल बदलना हो तो GEMINI_VISION_MODEL सेट करें।
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_VISION_MODEL = "gemini-2.5-flash";
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

interface GeminiPart {
  text?: string;
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
  promptFeedback?: { blockReason?: string };
}

export async function askAboutImage(input: {
  imageDataUrl: string;
  text: string;
  history: LiveTurn[];
  lang: Lang;
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY सेट नहीं है");
  const model = process.env.GEMINI_VISION_MODEL ?? DEFAULT_VISION_MODEL;

  // data:image/jpeg;base64,XXXX से base64 हिस्सा निकालें (route पहले ही jpeg होना जांच चुका है)
  const match = /^data:image\/jpeg;base64,(.+)$/.exec(input.imageDataUrl);
  if (!match) throw new Error("तस्वीर का फ़ॉर्मेट सही नहीं है");
  const imageBase64 = match[1];

  // Gemini में बातचीत के रोल "user" और "model" होते हैं
  const contents = [
    ...input.history.map((h) => ({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: h.content }],
    })),
    {
      role: "user",
      parts: [
        { text: input.text },
        { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
      ],
    },
  ];

  const res = await fetch(`${BASE_URL}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.lang === "en" ? SYSTEM_EN : SYSTEM_HI }] },
      contents,
      generationConfig: { maxOutputTokens: 300, temperature: 0.4 },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`vision request failed (${res.status}) ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as GeminiResponse;
  if (data.promptFeedback?.blockReason) {
    throw new Error(`vision blocked: ${data.promptFeedback.blockReason}`);
  }

  const reply = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  await logCost({ step: "other", provider: "gemini", model, costPaise: COST_PER_ASK_PAISE, meta: { feature: "live" } });

  return reply.replace(/^(Sthamly|असिस्टेंट|Assistant):\s*/, "");
}