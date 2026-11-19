// Sthamly AI web: push-to-talk recorder (Blueprint 3.0, section 4 aur 10)
// Mic se audio record karke ek Blob deta hai, jo /api/voice/turn par jaata hai.
// Audio kahin store nahi hota: sirf memory mein, stop ke baad Blob ban kar bhej diya jaata hai.
// Android (Capacitor) WebView mein mic permission aur audio format alag ho sakte hain (blueprint 4).
// Permission pehle se mili ho ya nahi, ye caller ko error ke code se pata chalta hai.

export type RecorderErrorCode =
  | "unsupported"
  | "permission_denied"
  | "no_microphone"
  | "recording_failed"
  | "too_long";

export class RecorderError extends Error {
  readonly code: RecorderErrorCode;

  constructor(code: RecorderErrorCode) {
    super(MESSAGE_HI[code]);
    this.name = "RecorderError";
    this.code = code;
  }
}

const MESSAGE_HI: Record<RecorderErrorCode, string> = {
  unsupported: "इस ब्राउज़र में आवाज़ रिकॉर्ड नहीं हो सकती।",
  permission_denied: "माइक्रोफ़ोन की अनुमति नहीं मिली। ब्राउज़र सेटिंग्स में माइक चालू करें।",
  no_microphone: "माइक्रोफ़ोन नहीं मिला।",
  recording_failed: "रिकॉर्डिंग नहीं हो सकी। दोबारा कोशिश करें।",
  too_long: "संदेश बहुत लंबा है। छोटा बोलें।",
};

// Worker ki limit se kam rakhte hain (MAX_AUDIO_BYTES ~6 MB). Ek turn ~60 second.
export const MAX_RECORD_SECONDS = 60;
const MAX_BYTES = 6 * 1024 * 1024;

// Browser jo format de sakta hai, usme se pehla pasand chunte hain.
// Worker ki allowed list (webm, mp4, wav, ogg, mp3) se match karte hain.
const PREFERRED_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

export interface RecordedAudio {
  blob: Blob;
  // Worker ka Content-Type. Codec ke bina base type (jaise audio/webm).
  mimeType: string;
  durationMs: number;
}

// Supported format chunta hai. Koi nahi mila to browser default lete hain.
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const type of PREFERRED_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

// Codec wala type "audio/webm;codecs=opus" ko "audio/webm" banata hai, Worker ke allowed list ke liye.
function baseMimeType(type: string): string {
  return type.split(";")[0]?.trim().toLowerCase() ?? "audio/webm";
}

export interface PushToTalkRecorder {
  // Mic khulta hai aur recording shuru hoti hai. Permission ka prompt yahin aata hai.
  start: () => Promise<void>;
  // Recording rokti hai aur audio deti hai.
  stop: () => Promise<RecordedAudio>;
  // Bina bheje recording band karti hai (user ne cancel kiya).
  cancel: () => void;
  // Recording chal rahi hai ya nahi.
  readonly recording: boolean;
}

// Ek recorder banata hai. Har turn ke liye naya banana chahiye.
export function createPushToTalkRecorder(): PushToTalkRecorder {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let startedAt = 0;
  let totalBytes = 0;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let stopResolve: ((audio: RecordedAudio) => void) | null = null;
  let stopReject: ((err: unknown) => void) | null = null;
  let autoStopped = false;

  function releaseStream(): void {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  function clearTimer(): void {
    if (maxTimer !== null) {
      clearTimeout(maxTimer);
      maxTimer = null;
    }
  }

  async function start(): Promise<void> {
    if (recorder !== null) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new RecorderError("unsupported");
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        throw new RecorderError("permission_denied");
      }
      if (name === "NotFoundError" || name === "OverconstrainedError") {
        throw new RecorderError("no_microphone");
      }
      throw new RecorderError("recording_failed");
    }

    const mimeType = pickMimeType();
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      releaseStream();
      throw new RecorderError("unsupported");
    }

    chunks = [];
    totalBytes = 0;
    autoStopped = false;

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
        totalBytes += event.data.size;
        // Size ki limit paar ho to rok dete hain, bhejne se pehle hi.
        if (totalBytes > MAX_BYTES && recorder?.state === "recording") {
          autoStopped = true;
          recorder.stop();
        }
      }
    };

    recorder.onerror = () => {
      clearTimer();
      releaseStream();
      const reject = stopReject;
      stopResolve = null;
      stopReject = null;
      recorder = null;
      reject?.(new RecorderError("recording_failed"));
    };

    recorder.onstop = () => {
      clearTimer();
      const resolve = stopResolve;
      const reject = stopReject;
      stopResolve = null;
      stopReject = null;
      const finishedAt = Date.now();
      const type = recorder?.mimeType || mimeType || "audio/webm";
      releaseStream();
      recorder = null;

      if (!resolve) return;
      if (chunks.length === 0 || totalBytes === 0) {
        reject?.(new RecorderError("recording_failed"));
        return;
      }
      if (autoStopped) {
        reject?.(new RecorderError("too_long"));
        return;
      }

      resolve({
        blob: new Blob(chunks, { type: baseMimeType(type) }),
        mimeType: baseMimeType(type),
        durationMs: finishedAt - startedAt,
      });
      chunks = [];
    };

    startedAt = Date.now();
    // Chhota slice: data jaldi aata hai, aur size limit bhi jaldi check hoti hai.
    recorder.start(1000);

    maxTimer = setTimeout(() => {
      if (recorder?.state === "recording") {
        autoStopped = true;
        recorder.stop();
      }
    }, MAX_RECORD_SECONDS * 1000);
  }

  function stop(): Promise<RecordedAudio> {
    return new Promise<RecordedAudio>((resolve, reject) => {
      if (recorder === null || recorder.state === "inactive") {
        reject(new RecorderError("recording_failed"));
        return;
      }
      stopResolve = resolve;
      stopReject = reject;
      recorder.stop();
    });
  }

  function cancel(): void {
    clearTimer();
    chunks = [];
    stopResolve = null;
    stopReject = null;
    if (recorder && recorder.state !== "inactive") {
      // onstop mein resolve nahi hoga, kyunki stopResolve null hai.
      recorder.onstop = null;
      recorder.stop();
    }
    recorder = null;
    releaseStream();
  }

  return {
    start,
    stop,
    cancel,
    get recording() {
      return recorder !== null && recorder.state === "recording";
    },
  };
}