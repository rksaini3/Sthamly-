// Sthamly AI web: paardarshi (transparent) tasveer ke peeche safed background lagana.
// Sab kuch device par canvas se hota hai. Tasveer kahin upload nahi hoti.

import { loadImage } from "./imageIO";

// Tasveer ke peeche safed rang bharkar PNG Blob deta hai.
export async function toWhiteBackground(src: string): Promise<Blob> {
  const img = await loadImage(src);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (width === 0 || height === 0) throw new Error("empty image");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))),
      "image/png",
    );
  });
}