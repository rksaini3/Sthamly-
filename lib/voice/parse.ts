import { z } from "zod";
import { getAIProvider } from "@/lib/ai";
import { logCost } from "@/lib/cost";

const offerSchema = z.object({
  offerText: z.string().trim().min(3).max(300),
  occasion: z.string().trim().max(60).nullable(),
});

export type ParsedOffer = z.infer<typeof offerSchema>;

function buildPrompt(text: string): string {
  return [
    "नीचे एक दुकानदार के वॉइस नोट का text है (हिंदी/हिंग्लिश, शायद गलत लिखा हो)।",
    "उससे दो चीज़ें निकालें और सिर्फ़ JSON लौटाएं, कोई और शब्द नहीं:",
    '{"offerText": "...", "occasion": "..." या null}',
    "",
    "नियम:",
    "- offerText में वस्तु, कीमत और छूट बिल्कुल वैसी लिखें जैसी कही गई। 10% को 10% ही रखें, कुछ न जोड़ें, कुछ न घटाएं।",
    "- occasion में त्योहार या मौका लिखें (जैसे दिवाली)। न हो तो null।",
    "- 'पोस्टर बना दो' जैसे निर्देश offerText में न जोड़ें।",
    "- ऑफर समझ न आए तो offerText खाली string रखें।",
    "",
    `Text: """${text}"""`,
  ].join("\n");
}

// Model कभी-कभी JSON के आगे-पीछे शब्द लिख देता है, इसलिए पहला { से आखिरी } तक लें
function extractJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Text से ऑफर और मौका निकालें। समझ न आए तो null।
 */
export async function parseOfferFromText(text: string): Promise<ParsedOffer | null> {
  const provider = getAIProvider();
  const result = await provider.generateText({ prompt: buildPrompt(text), maxTokens: 200 });

  await logCost({
    step: "voice",
    provider: provider.name,
    model: "text-parse",
    costPaise: result.costPaise,
  });

  const json = extractJson(result.text ?? "");
  if (!json) return null;

  const parsed = offerSchema.safeParse(json);
  if (!parsed.success) return null;

  return parsed.data;
}