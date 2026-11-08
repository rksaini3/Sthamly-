import { z } from "zod";
import { getAIProvider } from "@/lib/ai";
import { logCost } from "@/lib/cost";

const offerSchema = z.object({
  offerText: z.string().trim().max(300),
  occasion: z.string().trim().max(60).nullable(),
});

export type ParsedOffer = z.infer<typeof offerSchema>;

// Reasoning model पहले सोचता है, इसलिए जवाब के लिए काफ़ी जगह दें
const MAX_TOKENS = 1000;

function buildPrompt(text: string): string {
  return [
    "नीचे एक दुकानदार के वॉइस नोट का text है (हिंदी/हिंग्लिश, शायद गलत लिखा हो)।",
    "उससे दो चीज़ें निकालें और सिर्फ़ JSON लौटाएं, कोई और शब्द नहीं:",
    '{"offerText": "...", "occasion": "..." या null}',
    "",
    "नियम:",
    "- offerText में वस्तु, कीमत और छूट बिल्कुल वैसी लिखें जैसी कही गई। 10% को 10% ही रखें, कुछ न जोड़ें, कुछ न घटाएं।",
    "- अगर वाक्य में कीमत या छूट नहीं है, तो भी वस्तु और मात्रा offerText में लिखें।",
    "- occasion में त्योहार या मौका लिखें (जैसे दिवाली)। न हो तो null।",
    "- 'पोस्टर बना दो' जैसे निर्देश offerText में न जोड़ें।",
    "",
    `Text: """${text}"""`,
  ].join("\n");
}

// मॉडल की सोच में भी {} हो सकते हैं, इसलिए सबसे आखिरी ऐसा JSON लें जिसमें offerText हो
function extractJson(raw: string): Record<string, unknown> | null {
  const candidates = raw.match(/\{[^{}]*\}/g);
  if (!candidates) return null;

  for (let i = candidates.length - 1; i >= 0; i--) {
    const candidate = candidates[i] ?? "";
    try {
      const value: unknown = JSON.parse(candidate);
      if (typeof value === "object" && value !== null && "offerText" in value) {
        return value as Record<string, unknown>;
      }
    } catch {
      // यह candidate JSON नहीं है, अगला देखें
    }
  }
  return null;
}

/**
 * Text से ऑफर और मौका निकालें।
 * मॉडल ऑफर न निकाले, तो बोली गई बात ही ऑफर मानी जाती है।
 * दुकानदार "लागू करें" दबाकर पक्का करेगा, इसलिए गलत हो तो वहीं रुक जाएगा।
 */
export async function parseOfferFromText(text: string): Promise<ParsedOffer | null> {
  const provider = getAIProvider();
  const result = await provider.generateText({ prompt: buildPrompt(text), maxTokens: MAX_TOKENS });

  await logCost({
    step: "voice",
    provider: provider.name,
    model: "text-parse",
    costPaise: result.costPaise,
  });

  const raw = result.text ?? "";
  const json = extractJson(raw);
  const parsed = json ? offerSchema.safeParse(json) : null;

  if (parsed?.success && parsed.data.offerText.length >= 3) {
    return parsed.data;
  }

  const fallback = text.trim();
  if (fallback.length >= 3) {
    console.warn("voice parse: मॉडल से ऑफर नहीं मिला, बोली गई बात इस्तेमाल हुई", raw.slice(0, 200));
    return { offerText: fallback.slice(0, 300), occasion: null };
  }

  console.error("voice parse: JSON नहीं मिला", raw.slice(0, 300));
  return null;
}