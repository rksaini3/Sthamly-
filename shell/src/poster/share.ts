import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("फ़ाइल नहीं पढ़ी जा सकी"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      // "data:image/png;base64," वाला हिस्सा हटाएं
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Poster शेयर करें। Native पर: cache में फ़ाइल लिखकर Android share sheet।
 * Browser (dev) में: सीधा download।
 */
export async function sharePoster(blob: Blob, fileName: string, text: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const data = await blobToBase64(blob);
  const written = await Filesystem.writeFile({
    path: fileName,
    data,
    directory: Directory.Cache,
  });
  await Share.share({
    title: "Sthamly पोस्टर",
    text,
    files: [written.uri],
  });
}