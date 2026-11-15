import { parseRupees } from "../ledger/money";

export type Intent =
  | { type: "poster"; offerText: string }
  | { type: "sale"; name: string; amountPaise: number; note: string | null }
  | { type: "payment"; name: string; amountPaise: number }
  | { type: "balance"; name: string }
  | { type: "unknown" };

// रकम: 500, 99.5, 1250.75 जैसी
const AMOUNT = "(\\d{1,8}(?:\\.\\d{1,2})?)";

const POSTER = /^(?:poster|पोस्टर)\s+(.{3,300})$/i;
const SALE = new RegExp(`^(?:udhaar|उधार)\\s+(.{2,40}?)\\s+${AMOUNT}(?:\\s+(.{1,80}))?$`, "i");
const PAYMENT = new RegExp(`^(?:paisa mila|पैसा मिला|paisa|पैसा)\\s+(.{2,40}?)\\s+${AMOUNT}$`, "i");
const BALANCE = /^(?:balance|बाकी|hisaab|हिसाब)\s+(.{2,40})$/i;

export function parseIntent(raw: string): Intent {
  const text = raw.trim().replace(/\s+/g, " ");

  const poster = POSTER.exec(text);
  if (poster) return { type: "poster", offerText: poster[1] ?? "" };

  const sale = SALE.exec(text);
  if (sale) {
    const paise = parseRupees(sale[2] ?? "");
    if (paise === null) return { type: "unknown" };
    return { type: "sale", name: (sale[1] ?? "").trim(), amountPaise: paise, note: sale[3]?.trim() || null };
  }

  const payment = PAYMENT.exec(text);
  if (payment) {
    const paise = parseRupees(payment[2] ?? "");
    if (paise === null) return { type: "unknown" };
    return { type: "payment", name: (payment[1] ?? "").trim(), amountPaise: paise };
  }

  const balance = BALANCE.exec(text);
  if (balance) return { type: "balance", name: (balance[1] ?? "").trim() };

  return { type: "unknown" };
}

// नाम मिलाने के लिए: छोटे-बड़े अक्षर और अतिरिक्त space का फ़र्क नहीं
export function sameName(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(a) === norm(b);
}