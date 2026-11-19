import type { Outline } from "@/lib/studio/parse";

// PPTX सीधे यूज़र के browser में बनता है (PptxGenJS), server पर कोई भार नहीं।
// dynamic import: library सिर्फ़ तब लोड हो जब यूज़र PPTX बनाए।
export async function buildPptx(outline: Outline): Promise<Blob> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = outline.title;

  const cover = pptx.addSlide();
  cover.background = { color: "1F2937" };
  cover.addText(outline.title, {
    x: 0.8,
    y: 2.4,
    w: 11.7,
    h: 1.8,
    fontSize: 40,
    bold: true,
    color: "FFFFFF",
    fontFace: "Arial",
    align: "center",
  });

  for (const item of outline.slides) {
    const slide = pptx.addSlide();
    slide.addText(item.title, {
      x: 0.6,
      y: 0.4,
      w: 12,
      h: 0.9,
      fontSize: 30,
      bold: true,
      color: "1F2937",
      fontFace: "Arial",
    });
    slide.addText(
      item.bullets.map((text) => ({ text, options: { bullet: true, breakLine: true } })),
      {
        x: 0.8,
        y: 1.6,
        w: 11.6,
        h: 5.2,
        fontSize: 20,
        color: "374151",
        fontFace: "Arial",
        valign: "top",
      },
    );
  }

  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  return blob;
}