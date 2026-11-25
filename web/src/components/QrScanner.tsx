// Sthamly AI web: header ka QR scanner. Camera (ya chuni hui fotos) mein QR ya barcode pakadta hai.
// Pakda gaya text parent ko milta hai (ChatPage composer mein daalta hai). Camera band karna zaroori hai.
// Decode ke liye jsQR (chhota, bina server ke). Camera na mile to fotos se scan ka rasta khula hai.

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import "./QrScanner.css";

interface QrScannerProps {
  open: boolean;
  onResult: (text: string) => void;
  onClose: () => void;
}

// Frame bahut bada ho to chhota karte hain: decode tez, phone garam nahi.
const MAX_WIDTH = 640;

export function QrScanner({ open, onResult, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resultRef = useRef(onResult);
  const [camError, setCamError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Naya callback hamesha yaad rahe, bina camera dobara khole.
  useEffect(() => {
    resultRef.current = onResult;
  }, [onResult]);

  // Camera chalu: open hone par. Band hone par (ya unmount) sab rok do.
  useEffect(() => {
    if (!open) return;
    setCamError(null);
    setFileError(null);

    let cancelled = false;
    let done = false;
    let raf = 0;
    let stream: MediaStream | null = null;

    async function start(): Promise<void> {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamError("इस फ़ोन में कैमरा नहीं खुल सकता। नीचे से फ़ोटो चुनें।");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
      } catch {
        setCamError("कैमरा की अनुमति नहीं मिली। नीचे से फ़ोटो चुनें।");
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d", { willReadFrequently: true }) ?? null;
      if (!video || !canvas || !ctx) return;

      video.srcObject = stream;
      await video.play().catch(() => undefined);

      const tick = (): void => {
        if (cancelled || done) return;
        if (video.readyState >= 2 && video.videoWidth > 0) {
          const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
          const w = Math.round(video.videoWidth * scale);
          const h = Math.round(video.videoHeight * scale);
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          const frame = ctx.getImageData(0, 0, w, h);
          const code = jsQR(frame.data, w, h, { inversionAttempts: "dontInvert" });
          if (code && code.data) {
            done = true;
            resultRef.current(code.data);
            return;
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [open]);

  // Fotos se scan: file chuno, use decode karo.
  async function onFile(file: File): Promise<void> {
    setFileError(null);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true }) ?? null;
    if (!canvas || !ctx) return;

    const src = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = src;
      await img.decode();
      const scale = Math.min(1, MAX_WIDTH / img.naturalWidth);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      const frame = ctx.getImageData(0, 0, w, h);
      const code = jsQR(frame.data, w, h, { inversionAttempts: "attemptBoth" });
      if (code && code.data) {
        resultRef.current(code.data);
      } else {
        setFileError("इस फ़ोटो में QR नहीं मिला। साफ़ फ़ोटो चुनें।");
      }
    } catch {
      setFileError("यह फ़ोटो नहीं खुल सकी।");
    } finally {
      URL.revokeObjectURL(src);
    }
  }

  if (!open) return null;

  return (
    <div className="qrs" role="dialog" aria-modal="true" aria-label="QR स्कैन करें">
      <div className="qrs-head">
        <span>QR स्कैन करें</span>
        <button type="button" className="qrs-close" onClick={onClose} aria-label="बंद करें">
          ✕
        </button>
      </div>

      {!camError && (
        <div className="qrs-stage">
          <video ref={videoRef} className="qrs-video" playsInline muted />
          <div className="qrs-frame" aria-hidden="true" />
        </div>
      )}

      <canvas ref={canvasRef} hidden />

      {camError && <p className="qrs-error" role="alert">{camError}</p>}

      <label className="qrs-file">
        फ़ोटो से स्कैन करें
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void onFile(file);
          }}
        />
      </label>
      {fileError && <p className="qrs-error" role="alert">{fileError}</p>}

      <p className="qrs-note">QR या बारकोड दिखाएँ। पकड़ते ही उसकी जानकारी चैट में आ जाएगी।</p>
    </div>
  );
}