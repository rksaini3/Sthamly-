// Sthamly AI web: expert se sampark ka link. Call ke liye tel:, WhatsApp ke liye wa.me.
// Number na ho ya galat ho to null: UI us button ko band karke saaf likhta hai.

export type ContactChannel = "call" | "whatsapp";

// Bharat ke 10 ank wale number ke aage 91 lagata hai. Baaki number jaisa hai waisa.
export function contactHref(expert: { phone: string | null }, channel: ContactChannel): string | null {
  if (expert.phone === null) return null;
  const digits = expert.phone.replace(/\D/g, "");
  const full = digits.length === 10 ? `91${digits}` : digits;
  if (full.length < 11 || full.length > 15) return null;
  return channel === "call" ? `tel:+${full}` : `https://wa.me/${full}`;
}