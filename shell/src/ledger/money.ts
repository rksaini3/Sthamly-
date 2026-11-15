// रकम हमेशा paise (पूर्णांक) में रखी जाती है, ताकि 0.1+0.2 जैसी गलती न हो।
const MAX_PAISE = 1_000_000_000; // ₹1 करोड़ तक की एक entry

const formatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** "250", "99.5", "1,250.75" जैसा text → paise। गलत या शून्य हो तो null। */
export function parseRupees(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, "");
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(cleaned)) return null;

  const [whole = "0", fraction = ""] = cleaned.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isInteger(paise) || paise <= 0 || paise > MAX_PAISE) return null;
  return paise;
}

/** paise → "₹1,250" या "₹99.5"। ऋणात्मक संख्या नहीं दिखाई जाती, sign लेबल से तय होता है। */
export function formatRupees(paise: number): string {
  return `₹${formatter.format(Math.abs(paise) / 100)}`;
}