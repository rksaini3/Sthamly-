import { SIZE, layoutPoster, type DrawOp, type PosterInput } from "./layout";

let fontReady: Promise<void> | null = null;

// Devanagari font APK के अंदर (public/fonts)। एक बार load होकर cache में रहती है।
// Load fail हो तो अगली बार फिर कोशिश होगी।
export function loadPosterFont(): Promise<void> {
  if (!fontReady) {
    fontReady = (async () => {
      const face = new FontFace("Poster", "url(./fonts/NotoSansDevanagari-Regular.ttf)");
      await face.load();
      document.fonts.add(face);
    })().catch((error) => {
      fontReady = null;
      throw error;
    });
  }
  return fontReady;
}

function measurer(): (text: string, font: string) => number {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) throw new Error("इस device पर canvas सपोर्ट नहीं है");
  return (text, font) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };
}

function drawOps(ctx: CanvasRenderingContext2D, ops: DrawOp[]): void {
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  for (const op of ops) {
    if (op.kind === "rect") {
      ctx.fillStyle = op.color;
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else {
      ctx.font = op.font;
      ctx.fillStyle = op.color;
      ctx.fillText(op.text, op.x, op.y);
    }
  }
}

/** दिए गए canvas पर poster बनाएं (preview के लिए)। */
export async function drawPosterTo(canvas: HTMLCanvasElement, input: PosterInput): Promise<void> {
  await loadPosterFont();
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas नहीं खुला");
  const ops = layoutPoster(input, measurer());
  drawOps(ctx, ops);
}

/** PNG (Blob) बनाएं, share या save के लिए। */
export async function posterPng(input: PosterInput): Promise<Blob> {
  const canvas = document.createElement("canvas");
  await drawPosterTo(canvas, input);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG नहीं बन पाया"));
    }, "image/png");
  });
}