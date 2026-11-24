// Sthamly AI web: push-to-talk button (Blueprint 3.0, section 4 aur 10)
// Tap karo: recording shuru. Dobara tap: rok kar transcript lo. Cancel: bina bheje band.
// Audio recorder.ts se aata hai, /api/voice/turn par jaata hai, aur kahin store nahi hota.
// Transcript parent ko deta hai (onTranscript). Parent use input mein daale, user dekh kar bheje.
// Auto-stop (60 second ya size limit) par bhi saaf message aata hai, aur mic band ho jaata hai.

import { useEffect, useRef, useState } from "react";
import {
  createPushToTalkRecorder,
  MAX_RECORD_SECONDS,
  RecorderError,
  type PushToTalkRecorder,
  type RecordedAudio,
} from "./recorder";

type Phase = "idle" | "recording" | "transcribing";

export interface PushToTalkButtonProps {
  // Login token. Null ho to request nahi jaati.
  getToken: () => Promise<string | null>;
  // Transcript mila (khaali nahi). Parent isse input mein daalta hai.
  onTranscript: (text: string) => void;
  // Koi bhi error: message Hindi mein, seedha dikhane layak. code: mic ki vajah (friendlyFromMic ke liye).
  onError: (message: string, code?: string) => void;
  disabled?: boolean;
  // Whisper ko hint. Hinglish ke liye undefined chhodein.
  language?: "hi" | "en";
  // "orb": home par bada gol mic. Default: composer ke saath chhota.
  variant?: "default" | "orb";
}

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");
const FALLBACK_MESSAGE = "आवाज़ को लिखा नहीं जा सका। दोबारा कोशिश करें।";
const EMPTY_TRANSCRIPT_MESSAGE = "आवाज़ साफ़ सुनाई नहीं दी। दोबारा बोलें।";
const NOT_LOGGED_IN_MESSAGE = "पहले लॉग-इन करें।";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

// Recorder ka error hai to uska Hindi message, warna generic.
function messageFor(err: unknown): string {
  if (err instanceof RecorderError) return err.message;
  return FALLBACK_MESSAGE;
}

function codeFor(err: unknown): string | undefined {
  return err instanceof RecorderError ? err.code : undefined;
}

// Worker ka error body: { error: { message } }. Galat ho to fallback.
async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    const err = isRecord(body) ? body.error : undefined;
    if (isRecord(err) && typeof err.message === "string" && err.message.length > 0) {
      return err.message;
    }
  } catch {
    // body JSON nahi: fallback
  }
  return FALLBACK_MESSAGE;
}

// 75 seconds -> "01:15"
function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function statusFor(phase: Phase, elapsed: number): string {
  if (phase === "recording") return `सुन रहा हूँ… ${formatElapsed(elapsed)}`;
  if (phase === "transcribing") return "लिख रहा हूँ…";
  return "";
}

function labelFor(phase: Phase): string {
  if (phase === "recording") return "रोकें और लिखें";
  if (phase === "transcribing") return "लिखा जा रहा है";
  return "आवाज़ से लिखें";
}

function MicIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  );
}

const ROUND_BUTTON_STYLE = {
  width: 42,
  height: 42,
  padding: 0,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
} as const;

export function PushToTalkButton({
  getToken,
  onTranscript,
  onError,
  disabled = false,
  language,
  variant = "default",
}: PushToTalkButtonProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);

  const recorderRef = useRef<PushToTalkRecorder | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Ek waqt mein ek hi operation: start, stop ya transcribe. Double tap se dobara nahi chalta.
  const busyRef = useRef(false);

  // Callbacks ka latest version, taaki effects purane props na pakdein.
  const getTokenRef = useRef(getToken);
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    getTokenRef.current = getToken;
    onTranscriptRef.current = onTranscript;
    onErrorRef.current = onError;
  });

  // Recording ka timer. Agar recorder apne-aap ruk gaya (time ya size limit), to mic band karke message dikhayein.
  useEffect(() => {
    if (phase !== "recording") return;

    const startedAt = Date.now();
    setElapsed(0);

    const id = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(seconds);

      const rec = recorderRef.current;
      if (rec !== null && !rec.recording) {
        // Recorder apne-aap band ho gaya: limit paar hui.
        recorderRef.current = null;
        rec.cancel();
        setPhase("idle");
        busyRef.current = false;
        onErrorRef.current(new RecorderError("too_long").message, "too_long");
      }
    }, 250);

    return () => clearInterval(id);
  }, [phase]);

  // Unmount par mic band, chalti request abort.
  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
      recorderRef.current = null;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  async function startRecording(): Promise<void> {
    if (disabled || busyRef.current) return;
    busyRef.current = true;

    const rec = createPushToTalkRecorder();
    try {
      await rec.start();
      recorderRef.current = rec;
      setPhase("recording");
    } catch (err) {
      rec.cancel();
      onErrorRef.current(messageFor(err), codeFor(err));
    } finally {
      busyRef.current = false;
    }
  }

  async function stopAndSend(): Promise<void> {
    const rec = recorderRef.current;
    if (rec === null || busyRef.current) return;
    busyRef.current = true;
    recorderRef.current = null;

    let audio: RecordedAudio;
    try {
      audio = await rec.stop();
    } catch (err) {
      rec.cancel();
      setPhase("idle");
      busyRef.current = false;
      onErrorRef.current(messageFor(err), codeFor(err));
      return;
    }

    await transcribe(audio);
  }

  // Audio ko Worker ke /api/voice/turn par bhejta hai, aur transcript lautata hai.
  // busyRef yahin chhoota jaata hai (finally mein).
  async function transcribe(audio: RecordedAudio): Promise<void> {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("transcribing");

    try {
      const token = await getTokenRef.current();
      if (!token) {
        onErrorRef.current(NOT_LOGGED_IN_MESSAGE);
        return;
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "Content-Type": audio.mimeType,
        // Same key se dobara aaye to Whisper dobara nahi chalta
        "Idempotency-Key": crypto.randomUUID(),
      };
      if (language !== undefined) headers["X-Language"] = language;

      const res = await fetch(`${API_BASE}/api/voice/turn`, {
        method: "POST",
        headers,
        body: audio.blob,
        signal: controller.signal,
      });

      if (!res.ok) {
        onErrorRef.current(await readErrorMessage(res));
        return;
      }

      const body: unknown = await res.json();
      const text =
        isRecord(body) && typeof body.transcript === "string" ? body.transcript.trim() : "";

      if (text.length === 0) {
        onErrorRef.current(EMPTY_TRANSCRIPT_MESSAGE, "empty");
        return;
      }
      onTranscriptRef.current(text);
    } catch (err) {
      if (isAbort(err)) return;
      onErrorRef.current(FALLBACK_MESSAGE);
    } finally {
      abortRef.current = null;
      busyRef.current = false;
      setPhase("idle");
    }
  }

  function cancelRecording(): void {
    const rec = recorderRef.current;
    recorderRef.current = null;
    rec?.cancel();
    busyRef.current = false;
    setPhase("idle");
  }

  function handlePrimary(): void {
    if (phase === "idle") {
      void startRecording();
    } else if (phase === "recording") {
      void stopAndSend();
    }
  }

  const status = statusFor(phase, elapsed);

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {phase === "recording" && (
        <button type="button" className="btn-ghost" onClick={cancelRecording} aria-label="रिकॉर्डिंग रद्द करें">
          रद्द करें
        </button>
      )}

      <button
        type="button"
        className={[
          phase === "recording" ? "btn-stop" : "btn-ghost",
          variant === "orb" ? "ptt-orb" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={variant === "orb" ? undefined : ROUND_BUTTON_STYLE}
        onClick={handlePrimary}
        disabled={disabled || phase === "transcribing"}
        aria-label={labelFor(phase)}
        aria-pressed={phase === "recording"}
        title={`अधिकतम ${MAX_RECORD_SECONDS} सेकंड`}
      >
        <MicIcon />
      </button>

      {status !== "" && (
        <span className="muted small" aria-live="polite">
          {status}
        </span>
      )}
    </div>
  );
}