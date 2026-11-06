import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { loadDevanagariFont } from "@/lib/render/fonts";

const FONT_NAME = "NotoSansDevanagari";
const WATERMARK_TEXT = "Sthamly";

type SatoriNode = Parameters<typeof satori>[0];

export interface WatermarkInput {
  png: Buffer; // मूल poster (PNG)
  width: number;
  height: number;
}

// पूरे आकार की पारदर्शी SVG, जिसके नीचे दाएं कोने में छोटा "Sthamly" pill है
async function watermarkOverlay(width: number, height: number): Promise<string> {
  const font = await loadDevanagariFont();
  const scale = width / 1080;
  const px = (n: number) => Math.round(n * scale);

  const pill = {
    type: "div",
    props: {
      style: {
        display: "flex",
        alignItems: "center",
        padding: `${px(12)}px ${px(28)}px`,
        borderRadius: px(999),
        backgroundColor: "rgba(255,255,255,0.85)",
        fontSize: px(36),
        color: "#1c1917",
        fontFamily: FONT_NAME,
      },
      children: WATERMARK_TEXT,
    },
  } as unknown as SatoriNode;

  const root = {
    type: "div",
    props: {
      style: {
        display: "flex",
        position: "relative",
        width,
        height,
        justifyContent: "flex-end",
        alignItems: "flex-end",
        padding: px(40),
      },
      children: pill,
    },
  } as unknown as SatoriNode;

  return satori(root, {
    width,
    height,
    fonts: [{ name: FONT_NAME, data: font, weight: 400, style: "normal" }],
  });
}

/**
 * Free प्लान के poster पर watermark लगाएं।
 * Base PNG को SVG में रखकर उस पर watermark का overlay बनता है, फिर resvg से PNG।
 */
export async function applyWatermark({ png, width, height }: WatermarkInput): Promise<Buffer> {
  const overlay = await watermarkOverlay(width, height);
  const base64 = png.toString("base64");

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<image href="data:image/png;base64,${base64}" x="0" y="0" width="${width}" height="${height}"/>`,
    overlay,
    `</svg>`,
  ].join("");

  const out = new Resvg(svg, { fitTo: { mode: "original" } }).render().asPng();
  return Buffer.from(out);
}