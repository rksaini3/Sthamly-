/ Sthamly AI web: "मेरी गैलरी" page. Aapki banai hui sari tasveerein (Worker se, R2 storage par).
// Thumbnail ke liye har tasveer ka signed link Worker se aata hai (1 ghanta chalta hai).
// Download aur hatana (delete) yahin se. Sirf 'ready' tasveerein dikhti hain.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  deleteImage,
  getDownloadUrl,
  ImageApiError,
  listImages,
  openDownload,
  type ImageFile,
} from "../api/images";
import "./GalleryPage.css";

// File ka naam: title + sahi extension (mime ke hisaab se).
export function downloadNameFor(file: ImageFile): string {
  const ext =
    file.mime_type === "image/png" ? "png" : file.mime_type === "image/webp" ? "webp" : "jpg";
  const base = file.title.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60) || "sthamly-image";
  return `${base}.${ext}`;
}

export function GalleryPage() {
  const { user, getAccessToken } = useAuth();
  const [files, setFiles] = useState<ImageFile[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImageFile | null>(null);

  const token = useCallback(async (): Promise<string | null> => {
    const t = await getAccessToken();
    return t ?? null;
  }, [getAccessToken]);

  // Pehli baar list lo.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const t = await token();
        if (!t) return;
        const res = await listImages(t);
        if (!cancelled) setFiles(res.files.filter((f) => f.status === "ready"));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ImageApiError ? err.message : "गैलरी नहीं खुल सकी।");
          setFiles([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, token]);

  // Har tasveer ka thumbnail link (ek baar).
  useEffect(() => {
    if (!files || files.length === 0) return;
    let cancelled = false;
    (async () => {
      const t = await token();
      if (!t) return;
      for (const f of files) {
        if (cancelled) return;
        if (thumbs[f.id]) continue;
        try {
          const url = await getDownloadUrl(t, f.id);
          if (!cancelled) setThumbs((prev) => ({ ...prev, [f.id]: url }));
        } catch {
          // Ek tasveer ka link na bane to baaki chalti rahen.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // thumbs ko jaan-bujh kar dependency mein nahi rakha: ek hi baar banega.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, token]);

  async function onDownload(file: ImageFile): Promise<void> {
    setBusyId(file.id);
    setError(null);
    try {
      const t = await token();
      if (!t) return;
      await openDownload(t, file.id, downloadNameFor(file));
    } catch (err) {
      setError(err instanceof ImageApiError ? err.message : "डाउनलोड नहीं हो सका।");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(file: ImageFile): Promise<void> {
    if (!window.confirm("यह तस्वीर हमेशा के लिए हट जाएगी। पक्का?")) return;
    setBusyId(file.id);
    setError(null);
    try {
      const t = await token();
      if (!t) return;
      await deleteImage(t, file.id);
      setFiles((prev) => (prev ? prev.filter((f) => f.id !== file.id) : prev));
      setPreview((p) => (p?.id === file.id ? null : p));
    } catch (err) {
      setError(err instanceof ImageApiError ? err.message : "हटाया नहीं जा सका।");
    } finally {
      setBusyId(null);
    }
  }

  if (!user) return null;

  return (
    <div className="gal-page">
      <header className="gal-head">
        <Link to="/chat" className="gal-back" aria-label="वापस चैट पर">
          ←
        </Link>
        <h1>मेरी गैलरी</h1>
      </header>

      <main className="gal-body">
        {error && <p className="gal-error" role="alert">{error}</p>}

        {files === null && <p className="gal-note">लोड हो रहा है…</p>}

        {files !== null && files.length === 0 && !error && (
          <p className="gal-note">अभी कोई तस्वीर नहीं है। चैट में तस्वीर बनाएँ, वो यहाँ दिखेगी।</p>
        )}

        {files !== null && files.length > 0 && (
          <ul className="gal-grid">
            {files.map((f) => (
              <li key={f.id} className="gal-item">
                <button
                  type="button"
                  className="gal-thumb"
                  onClick={() => setPreview(f)}
                  aria-label={`${f.title} खोलें`}
                >
                  {thumbs[f.id] ? (
                    <img src={thumbs[f.id]} alt={f.title} loading="lazy" />
                  ) : (
                    <span className="gal-thumb-wait">…</span>
                  )}
                </button>
                <div className="gal-meta">
                  <span className="gal-title">{f.title}</span>
                  <div className="gal-row-actions">
                    <button
                      type="button"
                      className="gal-btn"
                      onClick={() => void onDownload(f)}
                      disabled={busyId === f.id}
                    >
                      डाउनलोड
                    </button>
                    <button
                      type="button"
                      className="gal-btn gal-btn-danger"
                      onClick={() => void onDelete(f)}
                      disabled={busyId === f.id}
                    >
                      हटाएँ
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {preview && (
        <div className="gal-preview" role="dialog" aria-modal="true" aria-label={preview.title}>
          <button
            type="button"
            className="gal-preview-close"
            onClick={() => setPreview(null)}
            aria-label="बंद करें"
          >
            ✕
          </button>
          {thumbs[preview.id] ? (
            <img className="gal-preview-img" src={thumbs[preview.id]} alt={preview.title} />
          ) : (
            <span className="gal-note">…</span>
          )}
          <div className="gal-preview-actions">
            <button type="button" className="gal-btn gal-btn-primary" onClick={() => void onDownload(preview)}>
              डाउनलोड करें
            </button>
            <button type="button" className="gal-btn gal-btn-danger" onClick={() => void onDelete(preview)}>
              हटाएँ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
