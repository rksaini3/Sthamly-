import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { loadDevanagariFont } from "@/lib/render/fonts";
import type { ShopCategory } from "@/types/domain";

const FONT_NAME = "NotoSansDevanagari";

export type PosterSize = "square" | "print";

// square: Instagram (1:1), print: A4 300 DPI
const SIZES: Record<PosterSize, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  print: { width: 2480, height: 3508 },
};

interface Theme {
  background: string;
  accent: string;
  text: string;
}

// कैटेगरी के हिसाब से रंग (brand kit इसे बदल सकता है)
const THEMES: Record<ShopCategory, Theme> = {
  sweets: { background: "#fff3e0", accent: "#c2410c", text: "#1c1917" },
  salon: { background: "#fdf2f8", accent: "#be185d", text: "#1c1917" },
  coaching_clinic: { background: "#eff6ff", accent: "#1d4ed8", text: "#0f172a" },
};

export interface PosterInput {
  shopName: string;
  offerText: string;
  occasion?: string | null;
  phone?: string | null;
  city?: string | null;
  category: ShopCategory;
  size: PosterSize;
  accentColor?: string | null; // brand kit से, ना हो तो कैटेगरी का रंग
  backgroundImage?: { data: Buffer; mimeType: "image/png" | "image/jpeg" } | null;
}

type SatoriNode = Parameters<typeof satori>[0];

// Satori के लिए एक div बनाने का छोटा helper (हर div को flex चाहिए)
function box(style: Record<string, string | number>, children?: SatoriNode[] | string): SatoriNode {
  return {
    type: "div",
    props: { style: { display: "flex", ...style }, children },
  } as unknown as SatoriNode;
}

function image(dataUrl: string, width: number, height: number): SatoriNode {
  return {
    type: "img",
    props: {
      src: dataUrl,
      style: { position: "absolute", top: 0, left: 0, width, height, objectFit: "cover" },
    },
  } as unknown as SatoriNode;
}

function buildTree(input: PosterInput, width: number, height: number): SatoriNode {
  const theme = THEMES[input.category];
  const accent = input.accentColor ?? theme.accent;
  const hasImage = Boolean(input.backgroundImage);
  const textColor = hasImage ? "#ffffff" : theme.text;

  // सारे माप 1080px के आधार पर हैं, प्रिंट साइज़ पर अपने-आप बढ़ते हैं
  const scale = width / 1080;
  const px = (n: number) => Math.round(n * scale);

  const layers: SatoriNode[] = [];
  if (input.backgroundImage) {
    const { data, mimeType } = input.backgroundImage;
    const dataUrl = `data:${mimeType};base64,${data.toString("base64")}`;
    layers.push(image(dataUrl, width, height));
    // टेक्स्ट पढ़ने लायक रखने के लिए नीचे की ओर अंधेरा
    layers.push(
      box({
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        backgroundImage:
          "linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(0,0,0,0.8))",
      }),
    );
  }

  const header = box(
    { fontSize: px(64), color: textColor, textAlign: "center", lineHeight: 1.2 },
    input.shopName,
  );

  const panelChildren = [
    input.occasion
      ? box(
          {
            fontSize: px(40),
            color: hasImage ? "#ffffff" : accent,
            marginBottom: px(16),
          },
          input.occasion,
        )
      : null,
    box(
      {
        fontSize: px(96),
        color: hasImage ? "#ffffff" : accent,
        textAlign: "center",
        lineHeight: 1.25,
      },
      input.offerText,
    ),
  ].filter((child): child is SatoriNode => child !== null);

  const panel = box(
    {
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: hasImage ? accent : theme.background,
      padding: px(56),
      borderRadius: px(36),
      maxWidth: Math.round(width * 0.86),
      border: hasImage ? "none" : `${px(6)}px solid ${accent}`,
    },
    panelChildren,
  );

  const contact = [input.phone, input.city].filter(Boolean).join("  •  ");
  const footer = contact
    ? box({ fontSize: px(44), color: textColor, textAlign: "center" }, contact)
    : null;

  const children = [...layers, header, panel, footer].filter(
    (child): child is SatoriNode => child !== null,
  );

  return box(
    {
      position: "relative",
      width,
      height,
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.background,
      padding: px(72),
      fontFamily: FONT_NAME,
    },
    children,
  );
}

/**
 * Poster बनाएं और PNG Buffer लौटाएं।
 * हिंदी टेक्स्ट code से लिखा जाता है (AI से नहीं), ताकि spelling सही रहे।
 */
export async function renderPoster(input: PosterInput): Promise<Buffer> {
  const { width, height } = SIZES[input.size];
  const font = await loadDevanagariFont();

  const svg = await satori(buildTree(input, width, height), {
    width,
    height,
    fonts: [{ name: FONT_NAME, data: font, weight: 400, style: "normal" }],
  });

  const png = new Resvg(svg, { fitTo: { mode: "original" } }).render().asPng();
  return Buffer.from(png);
}