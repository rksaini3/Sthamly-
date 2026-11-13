// जवाब की आखिरी जांच: खरीद/बेच/होल्ड की सलाह, टारगेट, गारंटी को रोकें।
const BLOCKED: RegExp[] = [
  /खरीद(ें|िए|ो)|बेच(ें|िए|ो)|होल्ड\s*करें/,
  /\b(buy|sell|hold)\b/i,
  /टारगेट\s*प्राइस|target\s*price/i,
  /गारंटी(ड)?|guaranteed|पक्का\s*मुनाफ़ा/i,
];

const DISCLAIMER =
  "यह सिर्फ़ शिक्षा के लिए है, निवेश की सलाह नहीं। निवेश से पहले SEBI-पंजीकृत सलाहकार से ज़रूर मिलें।";

export function checkFinanceAnswer(text: string): { ok: boolean; text: string; matched: string[] } {
  const matched = BLOCKED.filter((re) => re.test(text)).map((re) => re.source);
  if (matched.length > 0) {
    return { ok: false, text: DISCLAIMER, matched };
  }
  return { ok: true, text: `${text.trim()}\n\n${DISCLAIMER}`, matched };
}