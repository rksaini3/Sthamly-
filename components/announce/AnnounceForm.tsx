"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

function getRecognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function AnnounceForm() {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const recRef = useRef<RecognitionLike | null>(null);

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
    return () => {
      recRef.current?.stop();
    };
  }, []);

  function toggleMic() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = "hi-IN";
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = (e) => {
      // हर बार नया final वाक्य आखिरी में होता है
      const last = e.results[e.results.length - 1];
      const spoken = last?.[0]?.transcript?.trim() ?? "";
      if (spoken) {
        setText((prev) => (prev ? `${prev} ${spoken}` : spoken));
      }
    };
    rec.onerror = () => {
      setListening(false);
      setMsg({ kind: "error", text: "आवाज़ नहीं सुनाई दी, दोबारा बोलें या लिखें" });
    };
    rec.onend = () => setListening(false);

    recRef.current = rec;
    setMsg(null);
    rec.start();
    setListening(true);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg({ kind: "error", text: json?.error?.message ?? "घोषणा सेव नहीं हो पाई" });
        return;
      }
      setText("");
      setMsg({ kind: "ok", text: "घोषणा फ़ीड पर आ गई है।" });
    } catch {
      setMsg({ kind: "error", text: "नेटवर्क की गड़बड़ी, दोबारा कोशिश करें" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="stack">
      <textarea
        className="input"
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="जैसे: आज से दिवाली पर सभी मिठाई पर 10% छूट"
        maxLength={500}
        style={{ height: "auto", padding: 12, resize: "vertical" }}
      />

      {supported && (
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={toggleMic}
        >
          {listening ? "सुन रहा हूं… रोकने के लिए दबाएं" : "🎤 बोलकर लिखें"}
        </button>
      )}

      {msg && (
        <p
          role="status"
          className={msg.kind === "error" ? "alert alert-error" : "muted"}
          style={{ margin: 0 }}
        >
          {msg.text}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-block" disabled={saving || text.trim().length < 5}>
        {saving ? "सेव हो रहा है…" : "सार्वजनिक करें"}
      </button>
    </form>
  );
}