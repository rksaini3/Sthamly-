"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { UpgradeSheet } from "@/components/billing/UpgradeSheet";
import styles from "@/components/live/LiveCamera.module.css";
import { OFFER_STORAGE_KEY } from "@/components/voice/VoiceAssistant";
import type { Lang } from "@/lib/i18n";
import { LABELS } from "@/lib/labels";

type Phase = "intro" | "live";
type Busy = "idle" | "listening" | "transcribing" | "thinking";
type Facing = "environment" | "user";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const FRAME_MAX_SIDE = 768;
const FRAME_QUALITY = 0.7;

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

function Icon({ d, size = 22 }: { d: string[]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d.map((p) => (
        <path key={p} d={p} />
      ))}
    </svg>
  );
}

const I = {
  close: ["M6 6l12 12M18 6L6 18"],
  flip: ["M4 8a8 8 0 0113.7-3.3L20 7", "M20 3v4h-4", "M20 16a8 8 0 01-13.7 3.3L4 17", "M4 21v-4h4"],
  mic: ["M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z", "M5 11a7 7 0 0014 0", "M12 18v3"],
  stop: ["M7 7h10v10H7z"],
  send: ["M12 19V5", "M5 12l7-7 7 7"],
  speaker: ["M4 10v4h4l5 4V6L8 10z", "M16.5 9a4 4 0 010 6"],
  muted: ["M4 10v4h4l5 4V6L8 10z", "M17 9l5 6M22 9l-5 6"],
  keyboard: ["M3 7h18v10H3z", "M7 11h.01M11 11h.01M15 11h.01M7 14h10"],
  poster: ["M5 3h14v18H5z", "M9 9h.01", "M6 17l5-5 4 4 2-2 2 2"],
};

// लाइव: फ़ोन का कैमरा दिखाकर बोलें। Sthamly देखकर बोलकर जवाब देता है।
export function LiveCamera({ lang, loggedIn }: { lang: Lang; loggedIn: boolean }) {
  const t = LABELS[lang].live;
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("intro");
  const [busy, setBusy] = useState<Busy>("idle");
  const [facing, setFacing] = useState<Facing>("environment");
  const [voiceOn, setVoiceOn] = useState(true);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [lastAsk, setLastAsk] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const historyRef = useRef<Turn[]>([]);

  const stopCamera = useCallback(() => {
    camStreamRef.current?.getTracks().forEach((track) => track.stop());
    camStreamRef.current = null;
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!voiceOn || !("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === "en" ? "en-IN" : "hi-IN";
      window.speechSynthesis.speak(u);
    },
    [voiceOn, lang],
  );

  // पन्ना छोड़ते समय कैमरा, माइक और आवाज़ सब बंद
  useEffect(
    () => () => {
      camStreamRef.current?.getTracks().forEach((track) => track.stop());
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );

  async function openCamera(nextFacing: Facing): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t.camMissing);
      return false;
    }
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      camStreamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      return true;
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setError(name === "NotFoundError" ? t.camMissing : t.camDenied);
      return false;
    }
  }

  function start() {
    setError(null);
    // <video> पहले स्क्रीन पर आना चाहिए, इसलिए कैमरा नीचे वाले effect में खुलता है
    setPhase("live");
  }

  useEffect(() => {
    if (phase !== "live") return;
    let cancelled = false;
    void (async () => {
      const ok = await openCamera(facing);
      if (!ok && !cancelled) setPhase("intro");
    })();
    return () => {
      cancelled = true;
    };
    // कैमरा सिर्फ़ live शुरू होने पर खुलता है। पलटना flip() अलग से करता है।
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function flip() {
    const next: Facing = facing === "environment" ? "user" : "environment";
    setFacing(next);
    await openCamera(next);
  }

  function close() {
    stopCamera();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    router.push("/voice");
  }

  // कैमरे की अभी की तस्वीर, छोटी JPEG बनाकर
  function captureFrame(): string | null {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    const scale = Math.min(1, FRAME_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", FRAME_QUALITY);
  }

  async function ask(raw: string) {
    const text = raw.trim();
    if (text.length < 2) {
      setError(t.unclear);
      return;
    }
    const image = captureFrame();
    if (!image) {
      setError(t.camMissing);
      return;
    }
    setError(null);
    setLastAsk(text);
    setBusy("thinking");
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    try {
      const res = await fetch("/api/live/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, text, history: historyRef.current.slice(-6) }),
      });
      if (res.status === 402) {
        setSheet(true);
        setError(t.limit);
        return;
      }
      if (!res.ok) {
        setError(await readError(res, t.generic));
        return;
      }
      const data = (await res.json()) as { reply: string };
      const turns: Turn[] = [
        ...historyRef.current,
        { role: "user", content: text },
        { role: "assistant", content: data.reply },
      ];
      historyRef.current = turns.slice(-8);
      setReply(data.reply);
      speak(data.reply);
    } catch {
      setError(t.network);
    } finally {
      setBusy("idle");
    }
  }

  async function transcribeAndAsk(blob: Blob) {
    setBusy("transcribing");
    let said = "";
    try {
      const form = new FormData();
      form.append("audio", blob, "voice");
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
      if (!res.ok) {
        setError(await readError(res, t.generic));
        setBusy("idle");
        return;
      }
      said = ((await res.json()) as { text: string }).text.trim();
    } catch {
      setError(t.network);
      setBusy("idle");
      return;
    }
    if (said.length < 3) {
      setError(t.unclear);
      setBusy("idle");
      return;
    }
    await ask(said);
  }

  async function startTalking() {
    setError(null);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (typeof MediaRecorder === "undefined") {
      setError(t.micDenied);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const mime = pickMimeType();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = (rec.mimeType || "audio/webm").split(";")[0] ?? "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        micStreamRef.current?.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
        void transcribeAndAsk(blob);
      };
      rec.start();
      recorderRef.current = rec;
      setBusy("listening");
    } catch {
      setError(t.micDenied);
    }
  }

  function stopTalking() {
    recorderRef.current?.stop();
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = draft;
    setDraft("");
    void ask(value);
  }

  // जो देखा और बोला, उससे पोस्टर: ऑफ़र समझवाकर पोस्टर बनाने वाले पन्ने पर भेजें
  async function makePoster() {
    const source = [lastAsk, reply].filter(Boolean).join(". ");
    if (!source) return;
    setBusy("thinking");
    let offer: { offerText: string; occasion: string | null } | null = null;
    try {
      const res = await fetch("/api/voice/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: source.slice(0, 900) }),
      });
      if (res.ok) offer = ((await res.json()) as { offer: { offerText: string; occasion: string | null } | null }).offer;
    } catch {
      // ऑफ़र न समझ आए तो भी बोली हुई बात से आगे बढ़ें
    }
    try {
      sessionStorage.setItem(
        OFFER_STORAGE_KEY,
        JSON.stringify({ offerText: offer?.offerText ?? (lastAsk ?? source).slice(0, 300), occasion: offer?.occasion ?? null, kind: "poster" }),
      );
    } catch {
      // browser ने storage बंद रखा है, फिर भी आगे बढ़ें
    }
    stopCamera();
    router.push("/onboarding?kind=poster");
  }

  const status =
    busy === "listening" ? t.listening : busy === "transcribing" || busy === "thinking" ? t.thinking : "";

  if (!loggedIn) {
    return (
      <main className={styles.intro}>
        <h1 className={styles.introTitle}>{t.title}</h1>
        <p className={styles.introText}>{t.needLogin}</p>
        <Link href="/login?next=/live" className={styles.primary}>
          {t.login}
        </Link>
      </main>
    );
  }

  return (
    <div className={styles.page}>
      {phase !== "live" && (
        <main className={styles.intro}>
          <div className={styles.liveBadge}>
            <span className={styles.dot} aria-hidden />
            {t.title}
          </div>
          <h1 className={styles.introTitle}>{t.sub}</h1>
          <p className={styles.introText}>{t.intro}</p>
          <p className={styles.tip}>{t.tip}</p>
          {error && <p className={styles.error}>{error}</p>}
          <button type="button" className={styles.primary} onClick={start}>
            {t.start}
          </button>
          <p className={styles.beta}>{t.beta}</p>
          <Link href="/voice" className={styles.back}>
            {t.end}
          </Link>
        </main>
      )}

      {phase === "live" && (
        <>
          <video ref={videoRef} className={styles.video} playsInline muted autoPlay />

          <div className={styles.top}>
            <button type="button" className={styles.round} onClick={close} aria-label={t.end}>
              <Icon d={I.close} />
            </button>
            <div className={styles.liveBadge}>
              <span className={styles.dot} aria-hidden />
              {t.title}
            </div>
            <div className={styles.topRight}>
              <button
                type="button"
                className={styles.round}
                onClick={() => {
                  setVoiceOn((v) => !v);
                  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
                }}
                aria-label={voiceOn ? t.mute : t.unmute}
              >
                <Icon d={voiceOn ? I.speaker : I.muted} />
              </button>
              <button type="button" className={styles.round} onClick={() => void flip()} aria-label={t.flip}>
                <Icon d={I.flip} />
              </button>
            </div>
          </div>

          <div className={styles.bottom}>
            {(reply || error || status) && (
              <div className={styles.caption} role="status" aria-live="polite">
                {status && <p className={styles.status}>{status}</p>}
                {error && <p className={styles.errorLine}>{error}</p>}
                {!status && reply && <p className={styles.replyText}>{reply}</p>}
                {!status && reply && (
                  <button type="button" className={styles.chip} onClick={() => void makePoster()}>
                    <Icon d={I.poster} size={18} />
                    {t.makePoster}
                  </button>
                )}
              </div>
            )}

            {typing ? (
              <form className={styles.typeRow} onSubmit={onSubmit}>
                <input
                  className={styles.input}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t.placeholder}
                  maxLength={500}
                  autoFocus
                  disabled={busy !== "idle"}
                />
                <button type="submit" className={styles.round} disabled={busy !== "idle" || draft.trim().length < 2} aria-label={t.send}>
                  <Icon d={I.send} />
                </button>
              </form>
            ) : null}

            <div className={styles.controls}>
              <button type="button" className={styles.round} onClick={() => setTyping((v) => !v)} aria-label={t.placeholder}>
                <Icon d={I.keyboard} />
              </button>
              <button
                type="button"
                className={`${styles.talk} ${busy === "listening" ? styles.talkOn : ""}`}
                onClick={busy === "listening" ? stopTalking : () => void startTalking()}
                disabled={busy === "transcribing" || busy === "thinking"}
                aria-label={busy === "listening" ? t.stopTalk : t.talk}
              >
                <Icon d={busy === "listening" ? I.stop : I.mic} size={30} />
              </button>
              <span className={styles.spacer} aria-hidden />
            </div>
            <p className={styles.hintLine}>{busy === "listening" ? t.stopTalk : t.talk}</p>
          </div>
        </>
      )}

      <UpgradeSheet open={sheet} onClose={() => setSheet(false)} lang={lang} limitReached />
    </div>
  );
}