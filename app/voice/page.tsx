"use client";

import Link from "next/link";
import { useRef, useState, type CSSProperties, type FormEvent } from "react";

interface Offer {
  offerText: string;
  occasion: string | null;
}

type Busy = "idle" | "transcribing" | "parsing";

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return options.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data.error?.message ?? "कुछ गड़बड़ हुई, दोबारा कोशिश करें";
  } catch {
    return "कुछ गड़बड़ हुई, दोबारा कोशिश करें";
  }
}

export default function VoicePage() {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState<Busy>("idle");
  const [text, setText] = useState("");
  const [typed, setTyped] = useState("");
  const [offer, setOffer] = useState<Offer | null>(null);
  const [checked, setChecked] = useState(false);
  const [providers, setProviders] = useState<{ voice?: string; text?: string }>({});
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function parse(input: string) {
    setBusy("parsing");
    setError(null);
    setChecked(false);
    try {
      const res = await fetch("/api/voice/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input }),
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const data = (await res.json()) as { offer: Offer | null; provider: string };
      setOffer(data.offer);
      setProviders((p) => ({ ...p, text: data.provider }));
      setChecked(true);
    } catch {
      setError("नेटवर्क की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusy("idle");
    }
  }

  async function transcribe(blob: Blob) {
    setBusy("transcribing");
    setError(null);
    try {
      const form = new FormData();
      form.append("audio", blob, "voice");
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const data = (await res.json()) as { text: string; provider: string };
      setProviders((p) => ({ ...p, voice: data.provider }));
      setText(data.text);
      if (data.text.trim().length >= 3) {
        await parse(data.text.trim());
      } else {
        setError("आवाज़ साफ़ सुनाई नहीं दी। दोबारा बोलें।");
      }
    } catch {
      setError("नेटवर्क की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusy("idle");
    }
  }

  async function startRecording() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("इस browser में voice recording नहीं चलती। Chrome में खोलें, या नीचे लिखकर भेजें।");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mime = pickMimeType();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];

      rec.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      rec.onstop = () => {
        const type = (rec.mimeType || "audio/webm").split(";")[0] ?? "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        void transcribe(blob);
      };

      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      setError("माइक्रोफोन की अनुमति नहीं मिली। Browser की settings में mic allow करें।");
    }
  }

  function stopRecording() {
    setRecording(false);
    recorderRef.current?.stop();
  }

  function onTypedSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = typed.trim();
    if (value.length < 3) {
      setError("कम से कम 3 अक्षर लिखें");
      return;
    }
    setText(value);
    void parse(value);
  }

  const busyLabel =
    busy === "transcribing"
      ? "आवाज़ को लिखा जा रहा है…"
      : busy === "parsing"
        ? "ऑफर समझा जा रहा है…"
        : null;

  return (
    <main style={pageStyle}>
      <h1 style={{ margin: 0 }}>बोलें या लिखें</h1>
      <p style={muted}>दुकान का ऑफर बोलें या लिखें। हम उसे समझकर साफ़ ऑफर दिखाएंगे।</p>

      <section style={card}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={busy !== "idle"}
            aria-label={recording ? "रिकॉर्डिंग रोकें" : "रिकॉर्ड शुरू करें"}
            style={{
              ...micButton,
              background: recording ? "#b91c1c" : "var(--accent, #e0561a)",
              opacity: busy !== "idle" ? 0.6 : 1,
            }}
          >
            {recording ? "रोकें" : "बोलें"}
          </button>
          <p style={muted}>
            {recording ? "रिकॉर्ड हो रहा है। बात खत्म हो तो रोकें दबाएं।" : "माइक दबाकर अपना ऑफर बोलें"}
          </p>
        </div>
      </section>

      <form onSubmit={onTypedSubmit} style={card}>
        <label htmlFor="typed" style={label}>
          या यहां लिखें
        </label>
        <textarea
          id="typed"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          rows={3}
          maxLength={300}
          placeholder="जैसे: दिवाली पर सभी मिठाई पर 10% छूट"
          style={textarea}
        />
        <button type="submit" disabled={busy !== "idle" || recording} style={primaryButton}>
          जांचें
        </button>
      </form>

      {busyLabel && <p style={muted}>{busyLabel}</p>}
      {error && <p style={errorText}>{error}</p>}

      {text && (
        <section style={card}>
          <p style={label}>आपकी बात (ज़रूरत हो तो बदलें)</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={300} style={textarea} />
          <button
            type="button"
            onClick={() => parse(text.trim())}
            disabled={busy !== "idle" || text.trim().length < 3}
            style={secondaryButton}
          >
            फिर से समझें
          </button>
        </section>
      )}

      {checked && (
        <section style={card}>
          <p style={label}>समझा गया ऑफर</p>
          {offer ? (
            <>
              <p style={{ margin: "4px 0", fontWeight: 600 }}>{offer.offerText}</p>
              {offer.occasion && <p style={muted}>मौका: {offer.occasion}</p>}
            </>
          ) : (
            <p style={muted}>ऑफर समझ नहीं आया। साफ़ शब्दों में दोबारा लिखें।</p>
          )}
        </section>
      )}

      <section style={card}>
        <p style={label}>जांच (कौन सा router चला)</p>
        <p style={muted}>
          बोलकर text: {providers.voice ?? "अभी नहीं चला"}
          <br />
          Text से ऑफर: {providers.text ?? "अभी नहीं चला"}
        </p>
      </section>

      <p style={{ marginTop: 16 }}>
        <Link href="/onboarding" style={{ fontWeight: 600 }}>
          पोस्टर बनाने के लिए पोस्ट पेज पर जाएं
        </Link>
      </p>
    </main>
  );
}

const pageStyle: CSSProperties = { maxWidth: 480, margin: "0 auto", padding: "24px 16px 24px" };

const card: CSSProperties = {
  marginTop: 16,
  padding: 16,
  borderRadius: 14,
  border: "1px solid var(--border, rgba(127,127,127,0.25))",
  background: "var(--card, transparent)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const muted: CSSProperties = { color: "var(--muted, #78716c)", fontSize: "0.9rem", margin: 0 };

const label: CSSProperties = { fontWeight: 600, margin: 0 };

const errorText: CSSProperties = { color: "#b91c1c", margin: "12px 0 0" };

const textarea: CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: "1px solid var(--border, rgba(127,127,127,0.35))",
  fontFamily: "inherit",
  fontSize: "1rem",
  resize: "vertical",
  boxSizing: "border-box",
};

const micButton: CSSProperties = {
  width: 112,
  height: 112,
  borderRadius: 999,
  border: "none",
  color: "#fff",
  fontSize: "1.1rem",
  fontWeight: 700,
  boxShadow: "0 8px 22px rgba(224,86,26,0.35)",
};

const primaryButton: CSSProperties = {
  padding: "12px 16px",
  borderRadius: 12,
  border: "none",
  background: "var(--accent, #e0561a)",
  color: "#fff",
  fontWeight: 600,
  fontSize: "1rem",
};

const secondaryButton: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid var(--border, rgba(127,127,127,0.35))",
  background: "transparent",
  fontWeight: 600,
};