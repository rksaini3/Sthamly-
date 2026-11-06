import { readFile } from "node:fs/promises";
import path from "node:path";

// Noto Sans Devanagari, license जांचकर public/fonts/ में रखें
const FONT_FILE = "NotoSansDevanagari-Regular.ttf";

let cached: ArrayBuffer | undefined;

/** Satori के लिए font बफर। Serverless में एक बार load होकर cache रहेगा। */
export async function loadDevanagariFont(): Promise<ArrayBuffer> {
  if (cached) return cached;
  const filePath = path.join(process.cwd(), "public", "fonts", FONT_FILE);
  const buf = await readFile(filePath);
  cached = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return cached;
}