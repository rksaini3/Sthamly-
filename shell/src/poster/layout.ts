export type TemplateId = "sale" | "classic" | "minimal";

export interface PosterInput {
  shopName: string;
  offerText: string;
  occasion: string | null;
  phone: string;
  city: string;
  accent: string; // #rrggbb
  template: TemplateId;
}

interface TemplateStyle {
  label: string;
  background: string;
  // ऊपर का रंगीन band (0 मतलब band नहीं)
  bandHeight: number;
}

export const TEMPLATES: Record<TemplateId, TemplateStyle> = {
  sale: { label: "सेल (बड़ा ऑफ़र)", background: "#FFF8EE", bandHeight: 300 },
  classic: { label: "क्लासिक", background: "#FFFFFF", bandHeight: 220 },
  minimal: { label: "सादा", background: "#F5F5F4", bandHeight: 0 },
};

export const SIZE = 1080;
const FAMILY = "Poster";
const MARGIN = 80;
const DEFAULT_ACCENT = "#E0561A";
const OFFER_SIZES = [120, 104, 88, 72, 60];
const MAX_OFFER_LINES = 4;
const INK = "#1B1A17";

export type DrawOp =
  | { kind: "rect"; x: number; y: number; w: number; h: number; color: string }
  | { kind: "text"; x: number; y: number; text: string; font: string; color: string };

// font string (जैसे "700 56px Poster") की चौड़ाई नापता है। Canvas से आता है, test में नकली।
export type Measure = (text: string, font: string) => number;

export function safeAccent(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : DEFAULT_ACCENT;
}

// रंग की चमक से तय: गहरे रंग पर सफ़ेद अक्षर, हल्के पर काले
export function inkOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? INK : "#FFFFFF";
}

// शब्द-दर-शब्द wrap। एक शब्द ही चौड़ाई से बड़ा हो तो अक्षरों में काटा जाता है।
export function wrapText(text: string, font: string, maxWidth: number, measure: Measure): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate, font) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);

    let piece = "";
    for (const ch of word) {
      if (piece && measure(piece + ch, font) > maxWidth) {
        lines.push(piece);
        piece = ch;
      } else {
        piece += ch;
      }
    }
    current = piece;
  }

  if (current) lines.push(current);
  return lines;
}

export function layoutPoster(input: PosterInput, measure: Measure): DrawOp[] {
  const style = TEMPLATES[input.template];
  const accent = safeAccent(input.accent);
  const onAccent = inkOn(accent);
  const inner = SIZE - MARGIN * 2;
  const ops: DrawOp[] = [];

  // पृष्ठभूमि और ऊपर का band
  ops.push({ kind: "rect", x: 0, y: 0, w: SIZE, h: SIZE, color: style.background });
  if (style.bandHeight > 0) {
    ops.push({ kind: "rect", x: 0, y: 0, w: SIZE, h: style.bandHeight, color: accent });
  }

  // दुकान का नाम (और occasion), band हो तो उसके अंदर
  const nameColor = style.bandHeight > 0 ? onAccent : accent;
  const nameFont = `700 56px ${FAMILY}`;
  let y = MARGIN;
  const nameLines = wrapText(input.shopName || "आपकी दुकान", nameFont, inner, measure).slice(0, 2);
  for (const line of nameLines) {
    ops.push({ kind: "text", x: MARGIN, y, text: line, font: nameFont, color: nameColor });
    y += 66;
  }
  if (input.occasion) {
    ops.push({
      kind: "text",
      x: MARGIN,
      y: y + 6,
      text: input.occasion,
      font: `400 34px ${FAMILY}`,
      color: nameColor,
    });
  }

  // मुख्य ऑफ़र: जगह में फ़िट होने वाला सबसे बड़ा font
  const areaTop = style.bandHeight + 90;
  const areaBottom = SIZE - 230;
  const areaHeight = areaBottom - areaTop;

  let offerSize = OFFER_SIZES[OFFER_SIZES.length - 1] ?? 60;
  let offerLines: string[] = [];
  for (const size of OFFER_SIZES) {
    const font = `700 ${size}px ${FAMILY}`;
    const lines = wrapText(input.offerText, font, inner, measure);
    offerSize = size;
    offerLines = lines;
    if (lines.length <= MAX_OFFER_LINES && lines.length * size * 1.25 <= areaHeight) break;
  }

  // सबसे छोटे font पर भी न आए तो आखिरी लाइन में "…"
  if (offerLines.length > MAX_OFFER_LINES) {
    offerLines = offerLines.slice(0, MAX_OFFER_LINES);
    const last = offerLines[MAX_OFFER_LINES - 1] ?? "";
    offerLines[MAX_OFFER_LINES - 1] = `${last}…`;
  }

  const offerFont = `700 ${offerSize}px ${FAMILY}`;
  let oy = areaTop;
  for (const line of offerLines) {
    ops.push({ kind: "text", x: MARGIN, y: oy, text: line, font: offerFont, color: INK });
    oy += offerSize * 1.25;
  }

  // नीचे: accent रेखा, फ़ोन और शहर
  ops.push({ kind: "rect", x: MARGIN, y: SIZE - 200, w: inner, h: 6, color: accent });
  const contact = input.phone ? `फ़ोन: ${input.phone}` : "";
  const place = input.city ? `${input.city}` : "";
  const footer = [contact, place].filter(Boolean).join("   ·   ");
  if (footer) {
    ops.push({
      kind: "text",
      x: MARGIN,
      y: SIZE - 170,
      text: footer,
      font: `400 40px ${FAMILY}`,
      color: INK,
    });
  }

  return ops;
}