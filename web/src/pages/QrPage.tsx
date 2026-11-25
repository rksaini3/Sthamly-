// Sthamly AI web: "मेरा QR और रेफरल" page.
// Har user ka apna QR, jo uske रेफरल लिंक par jaata hai. QR download hota hai, aur WhatsApp par share hota hai.
// Abhi ye sirf link aur QR banata hai. Rewards aur kaun kiske link se aaya, ye baad mein server par jude ga.
// Code user id se banta hai (stable), isliye page ko koi server call nahi chahiye.

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import "./QrPage.css";

// User id ke pehle 8 akshar (dash hataakar): chhota, yaad rakhne layak, aur har user ke liye alag.
export function referralCodeFor(userId: string): string {
  return userId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function referralLinkFor(origin: string, code: string): string {
  return `${origin}/?ref=${code}`;
}

export function QrPage() {
  const { user } = useAuth();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const code = user ? referralCodeFor(user.id) : "";
  const link = user ? referralLinkFor(window.location.origin, code) : "";

  useEffect(() => {
    if (!link) return;
    let cancelled = false;
    QRCode.toDataURL(link, { width: 320, margin: 2, color: { dark: "#000000", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [link]);

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard band ho to link screen par dikh hi raha hai.
    }
  }

  if (!user) return null;

  const shareText = `Sthamly AI पर आइए। मेरा लिंक: ${link}`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return (
    <div className="qr-page">
      <header className="qr-head">
        <Link to="/chat" className="qr-back" aria-label="वापस चैट पर">
          ←
        </Link>
        <h1>मेरा QR और रेफरल</h1>
      </header>

      <main className="qr-body">
        <div className="qr-card">
          {dataUrl ? (
            <img className="qr-img" src={dataUrl} alt="आपका रेफरल QR कोड" width={260} height={260} />
          ) : (
            <div className="qr-img qr-img-placeholder" role="status">
              QR बन रहा है…
            </div>
          )}
          <p className="qr-code-label">आपका कोड: <strong>{code}</strong></p>
        </div>

        <div className="qr-link-row">
          <input className="qr-link" value={link} readOnly aria-label="रेफरल लिंक" onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="qr-btn" onClick={() => void copyLink()}>
            {copied ? "कॉपी हो गया" : "कॉपी करें"}
          </button>
        </div>

        <div className="qr-actions">
          {dataUrl && (
            <a className="qr-btn qr-btn-primary" href={dataUrl} download="sthamly-qr.png">
              QR डाउनलोड करें
            </a>
          )}
          <a className="qr-btn" href={whatsappHref} target="_blank" rel="noopener noreferrer">
            WhatsApp पर शेयर करें
          </a>
        </div>

        <p className="qr-note">
          जो लोग इस QR से या लिंक से आएँगे, उनका हिसाब बाद में जुड़ेगा। अभी QR और लिंक सिर्फ़ शेयर के लिए है।
        </p>
      </main>
    </div>
  );
}