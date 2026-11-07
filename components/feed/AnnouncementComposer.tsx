"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const MIN = 5;
const MAX = 500;

type RecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0?: { transcript: string } }>;
};

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type Msg = { type: "ok" | "err"; text: string } | null;

export function AnnouncementComposer({ loggedIn }: { loggedIn: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [rec, setRec] = useState<RecognitionLike | null>(null);

  if (!loggedIn) {
    return (
      <div className="card stack" style={{ gap: 8 }}>
        <p className="muted" style={{ margin: 0 }}>घोषणा डालने के लिए पहले लॉग-इन करें।</p>
        <Link href="/login?next=/feed" className="btn btn-primary btn-block">
          लॉग-इन करें
        </Link>
      </div>
    );
  }

  function toggleMic() {
    if (listening) {
      rec?.stop();
      setListening(false);
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => RecognitionLike;
      webkitSpeechRecognition?: new () => RecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setMsg({ type: "err", text: "इस फ़ोन में बोलकर लिखना उपलब्ध नहीं है" });
      return;
    }
    const r = new Ctor();
    r.lang = "hi-IN";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let add = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const item = e.results[i];
        if (item?.isFinal) add += item[0]?.transcript ?? "";
      }
      if (add) setBody((prev) => (prev ? `${prev} ${add.trim()}` : add.trim()));
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    setRec(r);
    r.start();
    setListening(true);
  }

  async function publish() {
    const text = body.trim();
    if (text.length < MIN) {
      setMsg({ type: "err", text: `कम से कम ${MIN} अक्षर लिखें` });
      return;
    }
    if (text.length > MAX) {
      setMsg({ type: "err", text: `${MAX} अक्षर से ज़्यादा नहीं` });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg({ type: "err", text: json?.error?.message ?? "नहीं हो पाया, दोबारा कोशिश करें" });
        return;
      }
      rec?.stop();
      setListening(false);
      setBody("");
      setOpen(false);
      setMsg({ type: "ok", text: "घोषणा सार्वजनिक हो गई" });
      router.refresh();
    } catch {
      setMsg({ type: "err", text: "नेटवर्क की गड़बड़ी, दोबारा कोशिश करें" });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="stack" style={{ gap: 8 }}>
        <button type="button" className="btn btn-primary btn-block" onClick={() => setOpen(true)}>
          नई घोषणा
        </button>
        {msg && (
          <p className={msg.type === "ok" ? "muted" : "alert alert-error"} style={{ margin: 0 }}>
            {msg.text}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="card stack" style={{ gap: 10 }}>
      <strong>नई घोषणा</strong>
      <textarea
        className="input"
        rows={4}
        maxLength={MAX}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="जैसे: आज से दूध 60 रुपये का है"
        disabled={busy}
      />
      <div className="row">
        <span className="muted" style={{ fontSize: "0.8rem" }}>{body.length}/{MAX}</span>
        <button
          type="button"
          className={listening ? "btn btn-primary" : "btn btn-ghost"}
          onClick={toggleMic}
          disabled={busy}
        >
          {listening ? "बोलना बंद करें" : "🎤 बोलकर लिखें"}
        </button>
      </div>
      {msg && (
        <p className={msg.type === "ok" ? "muted" : "alert alert-error"} style={{ margin: 0 }}>
          {msg.text}
        </p>
      )}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setMsg(null); }} disabled={busy}>
          रद्द करें
        </button>
        <button type="button" className="btn btn-primary" onClick={publish} disabled={busy}>
          {busy ? "डाल रहे हैं…" : "घोषणा करें"}
        </button>
      </div>
    </div>
  );
}