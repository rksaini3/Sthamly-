// Sthamly AI web: chat mein bhejne wali file (tasveer ya PDF) ko taiyar karna.
// Tasveer ko ek baar chhota karte hain (phone ki badi photo bhari hoti hai), phir data URL banate hain.
// Ye sirf file ko bhejne layak banata hai. Tasveer kisi bhi tarah edit nahi hoti: edit AI karta hai.

import { blobToDataUrl, transformImage, UPLOAD_MAX_EDGE } from "./imageIO";

// PDF ki upper limit (Worker bhi isi ke aas-paas rokta hai).
export const PDF_MAX_BYTES = 10 * 1024 * 1024;

export type Attachment =
  | {
      kind: "image";
      name: string;
      // Server ko bhejne ke liye (JPEG data URL).
      dataUrl: string;
      // Chip aur user ke message mein dikhane ke liye. Band karte waqt revoke karein.
      previewUrl: string;
    }
  | {
      kind: "pdf";
      name: string;
      dataUrl: string;
    };

// Upload ki gayi tasveer. Chhoti karke JPEG banata hai.
export async function imageToAttachment(src: string, name: string): Promise<Attachment> {
  const blob = await transformImage(src, {
    maxEdge: UPLOAD_MAX_EDGE,
    mime: "image/jpeg",
    quality: 0.9,
  });
  return {
    kind: "image",
    name,
    dataUrl: await blobToDataUrl(blob),
    previewUrl: URL.createObjectURL(blob),
  };
}

// Phone se chuni gayi file: tasveer ya PDF. Galat file par Hindi message ke saath error.
export async function fileToAttachment(file: File): Promise<Attachment> {
  if (file.type.startsWith("image/")) {
    const src = URL.createObjectURL(file);
    try {
      return await imageToAttachment(src, file.name);
    } finally {
      URL.revokeObjectURL(src);
    }
  }

  if (file.type === "application/pdf") {
    if (file.size > PDF_MAX_BYTES) {
      throw new Error("PDF 10 MB से बड़ी है। छोटी PDF चुनें।");
    }
    return {
      kind: "pdf",
      name: file.name,
      dataUrl: await blobToDataUrl(file),
    };
  }

  throw new Error("अभी सिर्फ़ तस्वीर या PDF चल सकती है।");
}