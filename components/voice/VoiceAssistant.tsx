"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "@/components/voice/VoiceAssistant.module.css";
import { formatRupees } from "@/lib/pricing";

export interface AssistantQuota {
  posterLeft: number;
  posterWindow: "day" | "week" | "month";
  walletPaise: number;
}

const WINDOW_LABEL: Record<AssistantQuota["posterWindow"], string> = {
  day: "आज",
  week: "इस हफ़्ते",
  month: "इस महीने",
};

// खाली स्क्रीन के सुझाव: कार्ड दबाने पर वाक्य लिखने की जगह में भर जाता है
const SUGGESTIONS: { label: string; prompt: string }[] = [
  { label: "दीवाली सेल का पोस्टर", prompt: "दीवाली सेल का पोस्टर बनाना है, ऑफ़र है " },
  { label: "प्रोडक्ट की फ़ोटो से कार्ड", prompt: "मेरे प्रोडक्ट की फ़ोटो से कार्ड बनाना है" },
  { label: "कल का मेन्यू", prompt: "कल का मेन्यू पोस्टर बनाना है" },
  { label: "कैंप या बैच का पोस्टर", prompt: "कैंप या बैच का पोस्टर बनाना है" },
];

interface Offer {
  offerText: string;
  occasion: string | null;
}

type Kind = "poster" | "reel";
type Busy = "idle" | "transcribing" | "replying" | "parsing";

interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  // अगर यह संदेश ऑफ़र का कार्ड है तो यहाँ नतीजा होगा (null = समझ नहीं आया)
  offerCard?: { offer: Offer | null };
}

// /onboarding पन्ना इसी key से समझा हुआ ऑफ़र और चुना हुआ प्रकार उठाता है
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

export function VoiceAssistant({
  name,
  loggedIn,
  quota,
}: {
  name: string;
  loggedIn: boolean;
  quota: AssistantQuota | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState<Busy>("idle");
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const idRef = useRef(0);
  const endRef = useRef<HTMLDivElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  function newId(): number {
    idRef.current += 1;
    return idRef.current;
  }

  // नया संदेश आने पर सबसे नीचे दिखाएं
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  // चैट से जवाब लेना। इतिहास में ऑफ़र कार्ड शामिल नहीं होते, सिर्फ़ बात-चीत।
  async function sendText(raw: string) {
    const text = raw.trim();
    if (text.length < 2) {
      setError("कुछ बोलें या लिखें");
      return;
    }
    setError(null);

    const userMsg: Message = { id: newId(), role: "user", text };
    const history = [...messages, userMsg]
      .filter((m) => !m.offerCard && m.text.trim().length > 0)
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.text.slice(0, 1000) }));

    setMessages((prev) => [...prev, userMsg]);
    setBusy("replying");
    try {
      const res = await fetch("/api/voice/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const data = (await res.json()) as { reply: string };
      setMessages((prev) => [...prev, { id: newId(), role: "assistant", text: data.reply }]);
    } catch {
      setError("नेटवर्क की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusy("idle");
    }
  }

  // किसी एक संदेश से ऑफ़र समझना
  async function makeOffer(text: string) {
    setError(null);
    setBusy("parsing");
    try {
      const res = await fetch("/api/voice/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const data = (await res.json()) as { offer: Offer | null };
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "assistant", text: "", offerCard: { offer: data.offer } },
      ]);
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
        return;
      }
      const data = (await res.json()) as { text: string };
      said = data.text.trim();
    } catch {
      setError("नेटवर्क की गड़बड़ी, दोबारा कोशिश करें");
      return;
    } finally {
      setBusy("idle");
    }

    if (said.length < 3) {
      setError("आवाज़ साफ़ सुनाई नहीं दी। दोबारा बोलें।");
      return;
    }
    await sendText(said);
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
    if (value.length < 2) {
      setError("कुछ लिखें");
      return;
    }
    setDraft("");
    void sendText(value);
  }

  // ऑफ़र चुने हुए प्रकार (पोस्टर या रील) के साथ onboarding पर भेजें
  function chooseOffer(offer: Offer, kind: Kind) {
    if (!loggedIn) {
      router.push("/login?next=/voice");
      return;
    }
    try {
      sessionStorage.setItem(OFFER_STORAGE_KEY, JSON.stringify({ ...offer, kind }));
    } catch {
      // browser ने storage बंद कर रखा है, फिर भी आगे बढ़ें
    }
    router.push(`/onboarding?kind=${kind}`);
  }

  const isEmpty = messages.length === 0;
  const hasDraft = draft.trim().length > 0;
  const status = recording
    ? "सुन रहा हूं… बोलना खत्म हो तो बटन दबाएं"
    : busy === "transcribing"
      ? "आवाज़ को लिखा जा रहा है…"
      : busy === "replying"
        ? "जवाब लिख रहा हूं…"
        : busy === "parsing"
          ? "ऑफ़र समझ रहा हूं…"
          : "";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.title}>Sthamly असिस्टेंट</div>
          <div className={styles.subtitle}>बोलकर या लिखकर बात करें</div>
        </div>
      </header>

      {quota && (
        <div className={styles.quota} aria-live="polite">
          <span>
            {WINDOW_LABEL[quota.posterWindow]} बचे पोस्टर: {quota.posterLeft}
          </span>
          <span>वॉलेट: {formatRupees(quota.walletPaise)}</span>
        </div>
      )}

      <section className={`${styles.stage} ${isEmpty ? styles.stageEmpty : ""}`}>
        {isEmpty && (
          <>
            <div
              aria-hidden
              className={`${styles.orb} ${recording ? styles.orbListening : ""} ${busy !== "idle" ? styles.orbBusy : ""}`}
            />
            <h1 className={styles.greeting}>नमस्ते, {name}</h1>
            <p className={styles.hint}>
              {loggedIn
                ? "अपनी दुकान की बात बोलें या लिखें। ऑफ़र बनाने के लिए संदेश के नीचे बटन दबाएं।"
                : "बातचीत के लिए पहले लॉग-इन करें।"}
            </p>

            {loggedIn && (
              <div className={styles.suggestions}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    className={styles.suggestion}
                    onClick={() => setDraft(s.prompt)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {messages.map((m) => {
          if (m.role === "user") {
            return (
              <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <div className={styles.bubbleUser}>{m.text}</div>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => void makeOffer(m.text)}
                  disabled={busy !== "idle"}
                >
                  ऑफ़र बनाएं
                </button>
              </div>
            );
          }

          if (m.offerCard) {
            const { offer } = m.offerCard;
            return (
              <div key={m.id} className={styles.bubbleBot}>
                {offer ? (
                  <>
                    <p className={styles.label}>मैंने यह ऑफ़र समझा:</p>
                    <p className={styles.offerText}>{offer.offerText}</p>
                    {offer.occasion && <p className={styles.muted}>मौका: {offer.occasion}</p>}
                    <div className={styles.btnRow}>
                      <button type="button" className={styles.btnPrimary} onClick={() => chooseOffer(offer, "poster")}>
                        पोस्टर बनाएं
                      </button>
                      <button type="button" className={styles.btnGhost} onClick={() => chooseOffer(offer, "reel")}>
                        रील बनाएं
                      </button>
                    </div>
                  </>
                ) : (
                  <p className={styles.muted}>ऑफ़र समझ नहीं आया। साफ़ शब्दों में दोबारा लिखें।</p>
                )}
              </div>
            );
          }

          return (
            <div key={m.id} className={styles.bubbleBot}>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.text}</p>
            </div>
          );
        })}

        <div ref={endRef} />
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
            maxLength={1000}
            disabled={recording || busy !== "idle"}
            aria-label="संदेश लिखें"
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