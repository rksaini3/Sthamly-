// Sthamly AI web: file ko phone ke share menu se bhejna (WhatsApp, Gmail, Drive...).
// Browser support na ho, ya user share band kar de, to false lautata hai: caller download par chala jaata hai.
// Signed URL ko kabhi log ya error mein nahi dikhaya jaata.

export type ShareOutcome = "shared" | "cancelled" | "unsupported";

export async function shareFromUrl(
  url: string,
  fileName: string,
  mimeType: string,
  title: string,
): Promise<ShareOutcome> {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (!nav || typeof nav.share !== "function" || typeof nav.canShare !== "function") {
    return "unsupported";
  }

  let blob: Blob;
  try {
    const res = await fetch(url);
    if (!res.ok) return "unsupported";
    blob = await res.blob();
  } catch {
    return "unsupported";
  }

  const file = new File([blob], fileName, { type: mimeType || blob.type || "application/octet-stream" });
  if (!nav.canShare({ files: [file] })) return "unsupported";

  try {
    await nav.share({ files: [file], title, text: title });
    return "shared";
  } catch (err) {
    // User ne share band kiya: ye galti nahi hai.
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    return "unsupported";
  }
}
