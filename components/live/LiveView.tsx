"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type Session,
} from "@google/genai";

const IN_RATE = 16000;
const OUT_RATE = 24000;
const VIDEO_W = 640;
const VIDEO_H = 480;
const FRAME_MS = 1000;

const SYSTEM_PROMPT = [
  "तुम Sthamly हो, छोटे दुकानदारों (मिठाई, सैलून, कोचिंग, क्लिनिक) के सहायक।",
  "हिंदी या हिंग्लिश में, छोटे और साफ़ वाक्यों में बोलो।",
  "अगर कैमरे में कुछ दिखे तो उसके बारे में सीधा जवाब दो।",
  "कोई गारंटी न दो, निवेश या कानूनी सलाह न दो।",
  "पता न हो तो साफ़ कहो कि पता नहीं। कुछ मत बनाओ।",
  "नाम पूछे जाने पर कहो कि तुम Sthamly हो।",
].join("\n");

const WORKLET_CODE = `
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

function downsampleToPcm16Base64(input: Float32Array, inRate: number, outRate: number): string {
  const ratio = inRate / outRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    let n = 0;
    for (let j = start; j < end; j++) {
      sum += input[j] ?? 0;
      n++;
    }
    const s = Math.max(-1, Math.min(1, n ? sum / n : 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(out.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function pcm16Base64ToFloat32(b64: string): Float32Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const i16 = new Int16Array(bytes.buffer);
  const f32 = new Float32Array(new ArrayBuffer(i16.length * 4));
  for (let i = 0; i < i16.length; i++) f32[i] = (i16[i] ?? 0) / 0x8000;
  return f32;
}

type Status = "idle" | "connecting" | "live" | "error";

export default function LiveView() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [useCamera, setUseCamera] = useState(false);
  const [log, setLog] = useState<{ role: "you" | "ai"; text: string }[]>([]);

  const sessionRef = useRef<Session | null>(null);
  const micRef = useRef<{ stream: MediaStream; ctx: AudioContext } | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const nextTimeRef = useRef(0);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const camStreamRef = useRef<MediaStream | null>(null);
  const frameTimerRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  function appendLog(role: "you" | "ai", text: string) {
    if (!text) return;
    setLog((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        return [...prev.slice(0, -1), { role, text: last.text + text }];
      }
      return [...prev, { role, text }];
    });
  }

  function stopPlayback() {
    sourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch {
        // पहले से रुका हो तो ठीक है
      }
    });
    sourcesRef.current = [];
    nextTimeRef.current = 0;
  }

  function playChunk(b64: string) {
    const ctx = playCtxRef.current;
    if (!ctx) return;
    const f32 = pcm16Base64ToFloat32(b64);
    const buffer = ctx.createBuffer(1, f32.length, OUT_RATE);
    buffer.copyToChannel(f32, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime, nextTimeRef.current);
    src.start(startAt);
    nextTimeRef.current = startAt + buffer.duration;
    sourcesRef.current.push(src);
    src.onended = () => {
      sourcesRef.current = sourcesRef.current.filter((s) => s !== src);
    };
  }

  function handleMessage(msg: LiveServerMessage) {
    const sc = msg.serverContent;
    if (sc?.interrupted) stopPlayback();
    for (const part of sc?.modelTurn?.parts ?? []) {
      const data = part.inlineData?.data;
      if (data) playChunk(data);
    }
    if (sc?.inputTranscription?.text) appendLog("you", sc.inputTranscription.text);
    if (sc?.outputTranscription?.text) appendLog("ai", sc.outputTranscription.text);
  }

  async function startMic(session: Session) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const ctx = new AudioContext();
    const url = URL.createObjectURL(new Blob([WORKLET_CODE], { type: "application/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "pcm-capture");
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      const data = downsampleToPcm16Base64(e.data, ctx.sampleRate, IN_RATE);
      session.sendRealtimeInput({ media: { data, mimeType: `audio/pcm;rate=${IN_RATE}` } });
    };
    source.connect(node);
    micRef.current = { stream, ctx };
  }

  async function startCamera(session: Session) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: VIDEO_W, height: VIDEO_H },
    });
    camStreamRef.current = stream;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    await video.play();

    const canvas = document.createElement("canvas");
    canvas.width = VIDEO_W;
    canvas.height = VIDEO_H;
    const g = canvas.getContext("2d");
    frameTimerRef.current = window.setInterval(() => {
      if (!g || video.readyState < 2) return;
      g.drawImage(video, 0, 0, VIDEO_W, VIDEO_H);
      const jpg = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
      if (!jpg) return;
      session.sendRealtimeInput({ media: { data: jpg, mimeType: "image/jpeg" } });
    }, FRAME_MS);
  }

  function stop() {
    sessionRef.current?.close();
    sessionRef.current = null;
    micRef.current?.stream.getTracks().forEach((t) => t.stop());
    micRef.current?.ctx.close();
    micRef.current = null;
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current = null;
    if (frameTimerRef.current) clearInterval(frameTimerRef.current);
    frameTimerRef.current = null;
    stopPlayback();
    playCtxRef.current?.close();
    playCtxRef.current = null;
    setStatus((s) => (s === "error" ? s : "idle"));
  }

  async function start() {
    setError("");
    setLog([]);
    setStatus("connecting");
    try {
      const res = await fetch("/api/live/token", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Live शुरू नहीं हो पाया");

      playCtxRef.current = new AudioContext({ sampleRate: OUT_RATE });
      await playCtxRef.current.resume();

      const ai = new GoogleGenAI({ apiKey: data.token });
      const session = await ai.live.connect({
        model: data.model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_PROMPT,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => setStatus("live"),
          onmessage: handleMessage,
          onerror: (e: ErrorEvent) => {
            setError(e.message || "कनेक्शन में गड़बड़ी");
            setStatus("error");
            stop();
          },
          onclose: () => stop(),
        },
      });
      sessionRef.current = session;

      await startMic(session);
      if (useCamera) await startCamera(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "कुछ गड़बड़ हुई");
      setStatus("error");
      stop();
    }
  }

  useEffect(() => () => stop(), []);

  const isLive = status === "live" || status === "connecting";

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Sthamly Live</h1>
      <p style={{ opacity: 0.7, marginTop: 0 }}>बोलिए, AI सुनेगा और बोलकर जवाब देगा।</p>

      <video
        ref={videoRef}
        muted
        playsInline
        style={{
          width: "100%",
          borderRadius: 12,
          background: "#000",
          display: useCamera && isLive ? "block" : "none",
        }}
      />

      {!isLive && (
        <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
          <input type="checkbox" checked={useCamera} onChange={(e) => setUseCamera(e.target.checked)} />
          कैमरा भी चालू करें (AI आपकी चीज़ या दुकान देख सकेगा)
        </label>
      )}

      <div style={{ display: "flex", gap: 12, margin: "16px 0" }}>
        {!isLive ? (
          <button onClick={start} style={btnStyle("#B5451B")}>
            शुरू करें
          </button>
        ) : (
          <button onClick={stop} style={btnStyle("#444")}>
            बंद करें
          </button>
        )}
        <span style={{ alignSelf: "center", fontSize: 14 }}>
          {status === "idle" && "तैयार"}
          {status === "connecting" && "जुड़ रहा है..."}
          {status === "live" && "🔴 लाइव"}
          {status === "error" && "गड़बड़ी"}
        </span>
      </div>

      {error && <p style={{ color: "#b00020" }}>{error}</p>}

      <div style={{ display: "grid", gap: 8 }}>
        {log.map((m, i) => (
          <div
            key={i}
            style={{
              justifySelf: m.role === "you" ? "end" : "start",
              background: m.role === "you" ? "#fff" : "#FCEEDF",
              padding: "8px 12px",
              borderRadius: 10,
              fontSize: 15,
              maxWidth: "85%",
            }}
          >
            <b>{m.role === "you" ? "आप: " : "Sthamly: "}</b>
            {m.text}
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 24 }}>
        माइक और कैमरा सिर्फ़ तभी चलेंगे जब आप चालू करें। बेहतर आवाज़ के लिए हेडफ़ोन लगाएं।
      </p>
    </div>
  );
}

function btnStyle(bg: string): CSSProperties {
  return {
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 18px",
    fontSize: 16,
    cursor: "pointer",
  };
}