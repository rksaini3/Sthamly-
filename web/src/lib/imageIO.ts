// Sthamly AI web: tasveer ka browser (canvas) mein kaam. Ghumana, chhota karna, aur server ke liye data URI banana.
// Sab kuch device par hota hai. Photo kahin upload nahi hoti, jab tak user background hatane ko na kahe.

export interface TransformOptions {
  // Sabse lambi side is se badi nahi hogi. Chhoti tasveer badhegi nahi.
  maxEdge: number;
  // 0, 90, 180 ya 270 degree ghumana.
  rotate?: number;
  // Output format. Default PNG (transparency ke liye).
  mime?: "image/png" | "image/jpeg" | "image/webp";
  // JPEG/WEBP ke liye quality (0 se 1).
  quality?: number;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

// Tasveer ko canvas par banata hai: ghumaana aur size ke hisaab se. Naya Blob deta hai.
export async function transformImage(src: string, opts: TransformOptions): Promise<Blob> {
  const img = await loadImage(src);
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  if (srcW === 0 || srcH === 0) throw new Error("empty image");

  const scale = Math.min(1, opts.maxEdge / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const rot = (((opts.rotate ?? 0) % 360) + 360) % 360;
  const swapped = rot === 90 || rot === 270;

  const canvas = document.createElement("canvas");
  canvas.width = swapped ? h : w;
  canvas.height = swapped ? w : h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))),
      opts.mime ?? "image/png",
      opts.quality,
    );
  });
}

// Blob ko data URI (base64) mein badalta hai, server ko bhejne ke liye.
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("read failed"));
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

// Upload ki gayi file ko data URL banane se pehle ek hi baar chhota karte hain: phone ki 4000px photo bhari hoti hai.
export const UPLOAD_MAX_EDGE = 1600;