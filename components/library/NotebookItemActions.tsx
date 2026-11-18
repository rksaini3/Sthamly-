"use client";

import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";

export interface NotebookItemActionsProps {
  jobId: string;
  status: "queued" | "running" | "done" | "failed";
  offerText: string;
  occasion: string | null;
  caption: string;
}

// सर्वर का संदेश निकालें (जैसे "यह पोस्टर अभी बन रहा है"), वरना सामान्य संदेश
async function messageFrom(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return data?.error?.message ?? fallback;
}

export function NotebookItemActions({ jobId, status, offerText, occasion, caption }: NotebookItemActionsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [offer, setOffer] = useState(offerText);
  const [occ, setOcc] = useState(occasion ?? "");
  const [cap, setCap] = useState(caption);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busyNow = status === "queued" || status === "running";
  const offerChanged = offer.trim() !== offerText.trim();
  const occChanged = (occ.trim() || null) !== (occasion ?? null);
  const capChanged = cap !== caption;

  // ---- सेव: सिर्फ़ बदली हुई चीज़ें भेजते हैं ----
  async function save() {
    setError(null);
    setNotice(null);
    const body: Record<string, unknown> = {};
    if (offerChanged) body.offerText = offer.trim();
    if (occChanged) body.occasion = occ.trim() || null;
    if (capChanged) body.caption = cap;
    if (Object.keys(body).length === 0) {
      setEditing(false);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await messageFrom(res, "बदलाव सेव नहीं हो पाया, दोबारा कोशिश करें"));
        return;
      }
      setEditing(false);
      if (offerChanged) {
        setNotice("ऑफ़र सेव हो गया। नया पोस्टर बनाने के लिए \"फिर से बनाएं\" दबाएं।");
      } else {
        setNotice("सेव हो गया");
      }
      router.refresh();
    } catch {
      setError("इंटरनेट की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusy(false);
    }
  }

  function cancelEdit() {
    setOffer(offerText);
    setOcc(occasion ?? "");
    setCap(caption);
    setError(null);
    setEditing(false);
  }

  // ---- फिर से बनाएं: नया पोस्टर, credit लगेगा ----
  async function regenerate() {
    setError(null);
    setNotice(null);
    const ok = window.confirm(
      "नया पोस्टर बनेगा और उसका credit लगेगा। क्या आप जारी रखना चाहते हैं?",
    );
    if (!ok) return;

    setBusy(true);
    try {
      // बदला हुआ ऑफ़र हो तो वही भेजें, वरना सर्वर पुराना इस्तेमाल करेगा
      const body: Record<string, unknown> = {};
      if (offerChanged) body.offerText = offer.trim();
      if (occChanged) body.occasion = occ.trim() || null;

      const res = await fetch(`/api/jobs/${jobId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await messageFrom(res, "पोस्टर दोबारा नहीं बन पाया"));
        return;
      }
      setEditing(false);
      setNotice("नया पोस्टर बनने लगा है। थोड़ी देर में नोटबुक में दिखेगा।");
      router.refresh();
    } catch {
      setError("इंटरनेट की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusy(false);
    }
  }

  // ---- नोटबुक से हटाना: काम और पोस्टर सुरक्षित रहते हैं ----
  async function hide() {
    setError(null);
    setNotice(null);
    const ok = window.confirm("यह नोटबुक से हट जाएगा। पोस्टर और हिसाब सुरक्षित रहेंगे। हटाएं?");
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenFromNotebook: true }),
      });
      if (!res.ok) {
        setError(await messageFrom(res, "नोटबुक से नहीं हट पाया"));
        return;
      }
      router.refresh();
    } catch {
      setError("इंटरनेट की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusy(false);
    }
  }

  // ---- दिखावट ----

  if (editing) {
    return (
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        <label style={labelStyle}>
          ऑफ़र
          <textarea
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            maxLength={300}
            rows={3}
            disabled={busy || busyNow}
            style={inputStyle}
          />
        </label>
        {busyNow && (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            यह पोस्टर अभी बन रहा है, इसलिए ऑफ़र अभी नहीं बदल सकते।
          </p>
        )}
        <label style={labelStyle}>
          मौका (जैसे दिवाली)
          <input
            value={occ}
            onChange={(e) => setOcc(e.target.value)}
            maxLength={60}
            disabled={busy || busyNow}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          कैप्शन
          <textarea
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            maxLength={2000}
            rows={4}
            disabled={busy}
            style={inputStyle}
          />
        </label>
        {error && <p role="alert" style={{ color: "var(--danger)", margin: 0, fontSize: 14 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            सेव करें
          </button>
          <button type="button" className="btn" onClick={cancelEdit} disabled={busy}>
            रद्द करें
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
      {notice && <p style={{ margin: 0, fontSize: 13, color: "var(--accent)" }}>{notice}</p>}
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn" onClick={() => setEditing(true)} disabled={busy}>
          बदलें
        </button>
        {status === "failed" && (
          <button type="button" className="btn btn-primary" onClick={regenerate} disabled={busy || busyNow}>
            फिर से बनाएं
          </button>
        )}
        {status === "done" && (
          <button type="button" className="btn" onClick={regenerate} disabled={busy || busyNow}>
            नया पोस्टर बनाएं
          </button>
        )}
        <button type="button" className="btn" onClick={hide} disabled={busy || busyNow}>
          नोटबुक से हटाएं
        </button>
      </div>
    </div>
  );
}

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 14,
  fontWeight: 600,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--border, #d4d4d4)",
  fontSize: 15,
  font: "inherit",
  boxSizing: "border-box",
};