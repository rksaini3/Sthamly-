import { getServerEnv } from "@/lib/env";
import type { AIProvider, AIResult, TextRequest, TranscribeRequest } from "@/lib/ai/types";

// Groq: text (chat) और voice (Whisper), दोनों एक ही GROQ_API_KEY से।
// Free tier में credit card नहीं लगता। Model बदलने के लिए GROQ_TEXT_MODEL और GROQ_VOICE_MODEL।
// llama-3.3-70b-versatile 16 अगस्त 2026 को बंद हो गया, इसलिए default अब openai/gpt-oss-120b है।
const BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_TEXT_MODEL = "openai/gpt-oss-120b";
const DEFAULT_VOICE_MODEL = "whisper-large-v3";
const TEXT_TIMEOUT_MS = 30_000;
const VOICE_TIMEOUT_MS = 90_000;
const AUDIO_DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

// Whisper को दुकान वाले शब्द पहले से बताएं, ताकि वे सही पहचाने जाएं।
// Whisper prompt में सिर्फ़ शब्द डालें, कोई निर्देश नहीं।
const VOICE_PROMPT =
  "दुकान का ऑफर। मिठाई, सैलून, कोचिंग, क्लिनिक, हेयर कट, फेशियल, छूट, प्रतिशत, रुपये, किलो, ग्राम, " +
  "दिवाली, रक्षाबंधन, होली, ईद, नया स्टॉक, आज ही, सिर्फ़ आज, एक के साथ एक फ्री, दो आलू लीशु पहने, " +
  "दस प्रतिशत छूट, पचास रुपये।";

function apiKey(): string {
  const { GROQ_API_KEY } = getServerEnv();
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY सेट नहीं है");
  }
  return GROQ_API_KEY;
}

// Blob के MIME type से Groq के लिए फ़ाइल का extension
function extensionFor(mimeType: string): string {
  const base = (mimeType.split(";")[0] ?? "").trim();
  if (base === "audio/ogg") return "ogg";
  if (base === "audio/mp4" || base === "audio/aac") return "m4a";
  if (base === "audio/mpeg") return "mp3";
  return "webm";
}

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[];
}

interface TranscriptionResponse {
  text?: string;
}

export const groqProvider: AIProvider = {
  name: "groq",

  async generateImage(): Promise<AIResult> {
    throw new Error("Groq पर image समर्थित नहीं है। IMAGE_PROVIDER में दूसरा provider रखें।");
  },

  async generateVideo(): Promise<AIResult> {
    throw new Error("Groq पर video समर्थित नहीं है। VIDEO के लिए दूसरा provider रखें।");
  },

  async generateText(req: TextRequest): Promise<AIResult> {
    const { GROQ_TEXT_MODEL } = getServerEnv();

    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_TEXT_MODEL ?? DEFAULT_TEXT_MODEL,
        messages: [{ role: "user", content: req.prompt }],
        max_tokens: req.maxTokens ?? 300,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(TEXT_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`Groq chat failed (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as ChatResponse;
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("Groq: जवाब खाली है");
    }

    // Free tier पर कोई खर्च नहीं
    return { text, costPaise: 0 };
  },

  async transcribe(req: TranscribeRequest): Promise<AIResult> {
    const { GROQ_VOICE_MODEL } = getServerEnv();

    // Groq सीधे URL नहीं पढ़ता, इसलिए पहले signed URL से फ़ाइल लेते हैं
    const audioRes = await fetch(req.audioUrl, {
      signal: AbortSignal.timeout(AUDIO_DOWNLOAD_TIMEOUT_MS),
    });
    if (!audioRes.ok) {
      throw new Error(`audio download failed (${audioRes.status})`);
    }

    const audio = await audioRes.blob();
    if (audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
      throw new Error("आवाज़ की फ़ाइल खाली है या बहुत बड़ी है");
    }

    const form = new FormData();
    form.append("file", audio, `voice.${extensionFor(audio.type)}`);
    form.append("model", GROQ_VOICE_MODEL ?? DEFAULT_VOICE_MODEL);
    form.append("language", req.language);
    form.append("prompt", VOICE_PROMPT);
    form.append("response_format", "json");
    form.append("temperature", "0");

    const res = await fetch(`${BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}` },
      body: form,
      signal: AbortSignal.timeout(VOICE_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`Groq transcription failed (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as TranscriptionResponse;
    return { text: (data.text ?? "").trim(), costPaise: 0 };
  },
};