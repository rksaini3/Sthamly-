import { z } from "zod";

// AI के जवाब से HTML निकालें। कोड-फ़ेंस (```html) या बिना फ़ेंस, दोनों चलेंगे।
// Stream के बीच में भी काम करता है: जितना HTML आ चुका है, उतना लौटाता है।
export function extractHtml(raw: string): string | null {
  const lower = raw.toLowerCase();
  const start = [lower.indexOf("<!doctype"), lower.indexOf("<html")]
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];
  if (start === undefined) return null;
  let html = raw.slice(start);
  // आखिर में बची कोड-फ़ेंस हटाएं
  html = html.replace(/```\s*$/, "").trimEnd();
  return html;
}

export const outlineSchema = z.object({
  title: z.string().trim().min(1).max(120),
  slides: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        bullets: z.array(z.string().trim().min(1).max(220)).min(1).max(6),
      }),
    )
    .min(3)
    .max(10),
});

export type Outline = z.infer<typeof outlineSchema>;

// मॉडल JSON के आगे-पीछे बातें लिख दे, तो पहला { से आखिरी } तक निकालते हैं
export function parseOutline(raw: string): Outline | null {
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try {
    const parsed = outlineSchema.safeParse(JSON.parse(raw.slice(first, last + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}