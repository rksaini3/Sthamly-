import type { Outline } from "@/lib/studio/parse";

// PDF भी browser में बनता है (pdf-lib)। A4 landscape, हर स्लाइड एक पन्ने पर (ज़रूरत हो तो आगे के पन्ने पर)।
// Hindi के लिए public/fonts वाला Noto Sans Devanagari embed होता है, क्योंकि standard fonts में देवनागरी नहीं होती।
const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN = 56;

export async function buildPdf(outline: Outline): Promise<Blob> {
  // fontkit का build पुराने generator helper (regeneratorRuntime) पर टिका है, जो bundle में नहीं आता।
  // इसलिए runtime पहले लोड होता है, फिर fontkit (देवनागरी shaping के लिए ज़रूरी)।
  await import("regenerator-runtime/runtime");
  const [{ PDFDocument, rgb }, { default: fontkit }] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
  ]);

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = await fetch("/fonts/NotoSansDevanagari-Regular.ttf").then((res) => {
    if (!res.ok) throw new Error("PDF font लोड नहीं हुआ");
    return res.arrayBuffer();
  });
  const font = await doc.embedFont(fontBytes, { subset: true });
  const ink = rgb(0.12, 0.16, 0.22);
  const bodyInk = rgb(0.22, 0.25, 0.32);

  // एक लाइन में कितने अक्षर फिट होंगे, इसके हिसाब से शब्द तोड़ना
  function wrap(text: string, size: number, maxWidth: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // पन्ना, और नीचे कितनी जगह बची है, उसका हिसाब
  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  function newPageIfNeeded(needed: number) {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  }

  // शीर्षक वाला पन्ना
  const titleSize = 36;
  const titleLines = wrap(outline.title, titleSize, PAGE_W - MARGIN * 2);
  y = PAGE_H / 2 + (titleLines.length * titleSize) / 2;
  for (const line of titleLines) {
    const w = font.widthOfTextAtSize(line, titleSize);
    page.drawText(line, { x: (PAGE_W - w) / 2, y, size: titleSize, font, color: ink });
    y -= titleSize * 1.3;
  }

  for (const item of outline.slides) {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;

    const headSize = 26;
    for (const line of wrap(item.title, headSize, PAGE_W - MARGIN * 2)) {
      newPageIfNeeded(headSize * 1.3);
      page.drawText(line, { x: MARGIN, y, size: headSize, font, color: ink });
      y -= headSize * 1.3;
    }
    y -= 14;

    const bodySize = 18;
    for (const bullet of item.bullets) {
      const lines = wrap(bullet, bodySize, PAGE_W - MARGIN * 2 - 24);
      for (let i = 0; i < lines.length; i++) {
        newPageIfNeeded(bodySize * 1.4);
        if (i === 0) page.drawText("•", { x: MARGIN, y, size: bodySize, font, color: bodyInk });
        page.drawText(lines[i] ?? "", {
          x: MARGIN + 24,
          y,
          size: bodySize,
          font,
          color: bodyInk,
        });
        y -= bodySize * 1.4;
      }
      y -= 8;
    }
  }

  const bytes = await doc.save();
  // pdf-lib का Uint8Array सीधे Blob में जाता है
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: "application/pdf" });
}