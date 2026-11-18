import { after } from "next/server";
import { getServerEnv } from "@/lib/env";

// Job बनते ही worker को तुरंत चलाएं, ताकि पोस्टर कुछ सेकंड में बने।
// Vercel Hobby में cron दिन में सिर्फ़ एक बार चलता है, यह उसी की कमी पूरी करता है।
// response जाने के बाद (after) चलता है, इसलिए यूज़र को इंतज़ार नहीं करना पड़ता।
// cron अब भी एक सुरक्षा-जाल के तौर पर चलता रहता है।
export function kickWorker(): void {
  try {
    const { CRON_SECRET } = getServerEnv();
    const base =
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
    if (!CRON_SECRET || !base) return;

    after(async () => {
      try {
        const res = await fetch(`${base}/api/cron/worker`, {
          headers: { authorization: `Bearer ${CRON_SECRET}` },
          signal: AbortSignal.timeout(250_000),
        });
        if (!res.ok) console.error("kick worker: HTTP", res.status);
      } catch (error) {
        console.error("kick worker failed", error instanceof Error ? error.message : "unknown");
      }
    });
  } catch (error) {
    // after() हर जगह उपलब्ध न हो (जैसे request के बाहर), तो काम न रुके; cron चलाएगा
    console.error("kick worker unavailable", error instanceof Error ? error.message : "unknown");
  }
}
