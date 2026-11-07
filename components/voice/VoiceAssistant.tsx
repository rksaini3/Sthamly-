"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import styles from "@/components/voice/VoiceAssistant.module.css";

interface Offer {
  offerText: string;
  occasion: string | null;
}

type Busy = "idle" | "transcribing" | "parsing";

// /onboarding पन्ना इसी key से समझा हुआ ऑफर उठा सकता है
export const OFFER_STORAGE_KEY = "sthamly:offer";

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

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

export function VoiceAssistant({ name, loggedIn }: { name: string; loggedIn: boolean }) {
  const router = useRouter();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState<Busy>("idle");
  const [draft, setDraft] = useState("");
  const [heard, setHeard] = useState<string | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function parse(input: string) {
    setHeard(input);
    setBusy("parsing");
    setError(null);
    setChecked(false);
    setOffer(null);
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
      const data = (await res.json()) as { offer: Offer | null };
      setOffer(data.offer);
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
    let said = "";
    try {
      const form = new FormData();
      form.append("audio", blob, "voice");
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
      if (!res.ok) {
        setError(await readError(res));
        setBusy("idle");
        return;
      }
      const data = (await res.json()) as { text: string };
      said = data.text.trim();
    } catch {
      setError("नेटवर्क की गड़बड़ी, दोबारा कोशिश करें");
      setBusy("idle");
      return;
    }

    if (said.length < 3) {
      setError("आवाज़ साफ़ सुनाई नहीं दी। दोबारा बोलें।");
      setBusy("idle");
      return;
    }
    await parse(said);
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

  function onSend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = draft.trim();
    if (value.length < 3) {
      setError("कम से कम 3 अक्षर लिखें");
      return;
    }
    setDraft("");
    void parse(value);
  }

  function applyOffer() {
    if (!offer) return;
    try {
      sessionStorage.setItem(OFFER_STORAGE_KEY, JSON.stringify(offer));
    } catch {
      // browser ने storage बंद कर रखा है, फिर भी आगे बढ़ें
    }
    router.push("/onboarding");
  }

  const hasDraft = draft.trim().length > 0;
  const showOrb = heard === null || busy !== "idle" || recording;
  const status = recording
    ? "सुन रहा हूं… बोलना खत्म हो तो बटन दबाएं"
    : busy === "transcribing"
      ? "आवाज़ को लिखा जा रहा है…"
      : busy === "parsing"
        ? "ऑफर समझ रहा हूं…"
        : "";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/feed" className={styles.back} aria-label="वापस जाएं">
          ←
        </Link>
        <div>
          <div className={styles.title}>Sthamly असिस्टेंट</div>
          <div className={styles.subtitle}>बोलकर या लिखकर ऑफर दें</div>
        </div>
      </header>

      <section className={`${styles.stage} ${heard === null ? styles.stageEmpty : ""}`}>
        {showOrb && (
          <div
            aria-hidden
            className={`${styles.orb} ${recording ? styles.orbListening : ""} ${busy !== "idle" ? styles.orbBusy : ""}`}
          />
        )}

        {heard === null && (
          <>
            <h1 className={styles.greeting}>नमस्ते, {name}</h1>
            <p className={styles.hint}>
              {loggedIn
                ? "अपनी दुकान का ऑफर बोलें या लिखें। हम उसे साफ़ करके दिखाएंगे।"
                : "ऑफर समझने के लिए पहले लॉग-इन करें।"}
            </p>
          </>
        )}

        {heard !== null && <div className={styles.bubbleUser}>{heard}</div>}

        {heard !== null && (busy === "parsing" || checked) && (
          <div className={styles.bubbleBot}>
            {busy === "parsing" && <p className={styles.muted}>ऑफर समझ रहा हूं…</p>}

            {checked && offer && (
              <>
                <p className={styles.label}>मैंने यह समझा:</p>
                <p className={styles.offerText}>{offer.offerText}</p>
                {offer.occasion && <p className={styles.muted}>मौका: {offer.occasion}</p>}
                <div className={styles.btnRow}>
                  <button type="button" className={styles.btnPrimary} onClick={applyOffer}>
                    लागू करें
                  </button>
                  <button type="button" className={styles.btnGhost} onClick={startRecording} disabled={busy !== "idle"}>
                    फिर से बोलें
                  </button>
                </div>
              </>
            )}

            {checked && !offer && (
              <>
                <p className={styles.muted}>ऑफर समझ नहीं आया। साफ़ शब्दों में दोबारा बोलें या लिखें।</p>
                <div className={styles.btnRow}>
                  <button type="button" className={styles.btnGhost} onClick={startRecording} disabled={busy !== "idle"}>
                    फिर से बोलें
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <div className={styles.composer}>
        {error && <p className={styles.error}>{error}</p>}
        {status && <p className={styles.status}>{status}</p>}

        <form className={styles.pill} onSubmit={onSend}>
          <input
            className={styles.input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="संदेश लिखें…"
            maxLength={300}
            disabled={recording || busy !== "idle"}
            aria-label="ऑफर लिखें"
          />

          {hasDraft ? (
            <button
              type="submit"
              className={`${styles.circle} ${styles.circleSend}`}
              disabled={busy !== "idle"}
              aria-label="भेजें"
            >
              <SendIcon />
            </button>
          ) : (
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              disabled={busy !== "idle"}
              className={`${styles.circle} ${recording ? styles.circleStop : ""}`}
              aria-label={recording ? "रिकॉर्डिंग रोकें" : "बोलें"}
            >
              {recording ? <StopIcon /> : <MicIcon />}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}