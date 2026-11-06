import type { OutputType } from "@/types/domain";

interface OutputCardProps {
  type: OutputType;
  url: string | null; // poster की signed URL
  content: string | null; // caption का text
  watermarked: boolean;
}

export function OutputCard({ type, url, content, watermarked }: OutputCardProps) {
  if (type === "poster") {
    return (
      <div className="output">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            {/* signed URL बाहरी है, इसलिए next/image की जगह सादा img */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="poster-img" src={url} alt="दुकान का पोस्टर" />
          </a>
        ) : (
          <p className="muted">पोस्टर का लिंक नहीं बन पाया। पेज दोबारा खोलें।</p>
        )}
        {watermarked && (
          <p className="muted">Free प्लान: watermark के साथ। बिना watermark के लिए प्लान अपग्रेड करें।</p>
        )}
      </div>
    );
  }

  if (type === "caption") {
    return (
      <div className="output">
        <p className="output-label">कैप्शन</p>
        <pre className="caption-box">{content ?? ""}</pre>
      </div>
    );
  }

  // रील अभी नहीं बनती, इसलिए इस प्रकार को दिखाया नहीं जाता
  return null;
}