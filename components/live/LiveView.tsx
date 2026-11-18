"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";
import type { Lang } from "@/lib/i18n";

export interface ShopContext {
  name: string;
  category: string;
}

const IN_RATE = 16000;
const OUT_RATE = 24000;
// फ़्रेम: कैमरा छोटा रहे (बैंडविड्थ बचे), स्क्रीन पढ़ने लायक बड़ी
const CAM_MAX_SIDE = 768;
const SCREEN_MAX_SIDE = 1024;
const FRAME_MS = 1000;
const JPEG_QUALITY = 0.6;

const CATEGORY_HI: Record<string, string> = {
  general: "सामान्य दुकान",
  kirana: "किराना",
  salon: "सैलून",
  clothing: "कपड़े",
  mobile: "मोबाइल की दुकान",
  clinic: "क्लिनिक",
  coaching: "कोचिंग",
};

const T = {
  hi: {
    title: "Sthamly लाइव",
    sub: "बोलिए। Sthamly सुनेगा और बोलकर जवाब देगा।",
    start: "शुरू करें",
    end: "बंद करें",
    connecting: "जुड़ रहा है…",
    live: "लाइव",
    listening: "सुन रहा है",
    muted: "म्यूट है",
    idle: "तैयार",
    error: "गड़बड़ी",
    camera: "कैमरा",
    screen: "स्क्रीन",
    stopScreen: "स्क्रीन बंद",
    mute: "म्यूट करें",
    unmute: "म्यूट हटाएं",
    warnTitle: "स्क्रीन शेयर से पहले",
    warnText:
      "स्क्रीन पर दिखने वाली हर चीज़ (पासवर्ड, संदेश, फ़ोटो, पैसों का विवरण) AI तक जा सकती है। सिर्फ़ वही चुनें जो दिखाना चाहते हैं।",
    warnOk: "समझ गया, शेयर करें",
    cancel: "रद्द करें",
    you: "आप",
    ai: "Sthamly",
    transcript: "बातचीत",
    retry: "फिर से शुरू करें",
    noSupport: "इस फ़ोन में स्क्रीन शेयर सपोर्ट नहीं है",
    micDenied: "माइक की अनुमति नहीं मिली। browser की settings में माइक चालू करें।",
    privacy: "माइक, कैमरा और स्क्रीन सिर्फ़ तभी चलेंगे जब आप चालू करें। बेहतर आवाज़ के लिए हेडफ़ोन लगाएं।",
    shop: "दुकान",
    noShop: "दुकान की जानकारी नहीं है। पहले Onboarding पूरा करें।",
    loginNeeded: "पहले लॉग-इन करें",
    loginBtn: "लॉग-इन करें",
  },
  en: {
    title: "Sthamly Live",
    sub: "Just speak. Sthamly listens and answers out loud.",
    start: "Start",
    end: "End",
    connecting: "Connecting…",
    live: "Live",
    listening: "Listening",
    muted: "Muted",
    idle: "Ready",
    error: "Error",
    camera: "Camera",
    screen: "Screen",
    stopScreen: "Stop screen",
    mute: "Mute",
    unmute: "Unmute",
    warnTitle: "Before you share your screen",
    warnText:
      "Everything on your screen (passwords, messages, photos, payment details) can reach the AI. Share only what you want to show.",
    warnOk: "Got it, share",
    cancel: "Cancel",
    you: "You",
    ai: "Sthamly",
    transcript: "Conversation",
    retry: "Start again",
    noSupport: "Screen sharing is not supported on this phone",
    micDenied: "Microphone permission was not given. Allow it in browser settings.",
    privacy: "Mic, camera and screen run only when you turn them on. Use headphones for better audio.",
    shop: "Shop",
    noShop: "No shop details yet. Finish onboarding first.",
    loginNeeded: "Please log in first",
    loginBtn: "Log in",
  },
} as const;

// AI को दुकान का संदर्भ और नियम
function buildPrompt(shop: ShopContext | null): string {
  const lines = [
    "तुम Sthamly हो, छोटे दुकानदारों और काम करने वालों का लाइव सहायक।",
    "उपयोगकर्ता जिस भाषा में बोले (हिंदी, हिंग्लिश या English), उसी में छोटे और साफ़ वाक्यों में जवाब दो।",
    "अगर कैमरा या स्क्रीन की तस्वीर मिल रही है, तो सिर्फ़ वही बताओ जो सच में दिख रहा है। धुंधला हो तो साफ़ कहो और बताओ कैमरा कैसे पकड़ें।",
    "स्क्रीन पर लिखा हो तो वही पढ़ो। दाम, ब्रांड, मात्रा या तारीख अंदाज़े से मत बताओ।",
    "किसी इंसान की पहचान मत बताओ।",
    "कोई गारंटी, निवेश, कानूनी या चिकित्सा सलाह मत दो।",
    "पता न हो तो साफ़ कहो कि पता नहीं। कुछ मत बनाओ।",
    "नाम पूछे जाने पर कहो कि तुम Sthamly हो।",
  ];
  if (shop) {
    const cat = CATEGORY_HI[shop.category] ?? shop.category;
    lines.push(
      `यह बातचीत "${shop.name}" (${cat}) के संदर्भ में है। जवाब इसी दुकान के हिसाब से दो।`,
    );
  }
  return lines.join("\n");
}

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
type Source = "camera" | "screen";

export function LiveView({ lang, shop }: { lang: Lang; shop: ShopContext | null }) {
  const t = T[lang];

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [source, setSource] = useState<Source | null>(null);
  const [muted, setMuted] = useState(false);
  const [showWarn, setShowWarn] = useState(false);
  const [log, setLog] = useState<{ role: "you" | "ai"; text: string }[]>([]);
  const [showLog, setShowLog] = useState(false);

  const sessionRef = useRef<Session | null>(null);
  const micRef = useRef<{ stream: MediaStream; ctx: AudioContext } | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const nextTimeRef = useRef(0);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const camStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const sourceRef = useRef<Source | null>(null);
  const mutedRef = useRef(false);

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

  // ---- आवाज़ बजाना ----

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
    // उपयोगकर्ता बीच में बोले तो AI की आवाज़ तुरंत रुके
    if (sc?.interrupted) stopPlayback();
    for (const part of sc?.modelTurn?.parts ?? []) {
      const data = part.inlineData?.data;
      if (data) playChunk(data);
    }
    if (sc?.inputTranscription?.text) appendLog("you", sc.inputTranscription.text);
    if (sc?.outputTranscription?.text) appendLog("ai", sc.outputTranscription.text);
  }

  // ---- माइक ----

  async function startMic(session: Session) {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      throw new Error(t.micDenied);
    }
    const ctx = new AudioContext();
    const url = URL.createObjectURL(new Blob([WORKLET_CODE], { type: "application/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "pcm-capture");
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (mutedRef.current) return;
      const data = downsampleToPcm16Base64(e.data, ctx.sampleRate, IN_RATE);
      session.sendRealtimeInput({ media: { data, mimeType: `audio/pcm;rate=${IN_RATE}` } });
    };
    source.connect(node);
    micRef.current = { stream, ctx };
  }

  function toggleMute() {
    const next = !mutedRef.current;
    mutedRef.current = next;
    micRef.current?.stream.getAudioTracks().forEach((tr) => (tr.enabled = !next));
    setMuted(next);
  }

  // ---- कैमरा और स्क्रीन: एक समय पर एक ही स्रोत ----

  function showSource(stream: MediaStream, kind: Source) {
    const video = previewRef.current;
    if (!video) return;
    video.srcObject = stream;
    sourceRef.current = kind;
    setSource(kind);
    void video.play().catch(() => {
      // autoplay रुके तो भी फ़्रेम भेजने की कोशिश चलती है
    });
  }

  function clearSource(kind: Source) {
    if (sourceRef.current !== kind) return;
    const video = previewRef.current;
    if (video) video.srcObject = null;
    sourceRef.current = null;
    setSource(null);
  }

  function stopCamera() {
    camStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    camStreamRef.current = null;
    clearSource("camera");
  }

  function stopScreen() {
    screenStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    screenStreamRef.current = null;
    clearSource("screen");
  }

  async function startCamera() {
    stopScreen();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    camStreamRef.current = stream;
    showSource(stream, "camera");
  }

  async function startScreen() {
    setShowWarn(false);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError(t.noSupport);
      return;
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 }, audio: false });
    stopCamera();
    screenStreamRef.current = stream;
    // उपयोगकर्ता "Stop sharing" दबाए तो बंद हो जाए
    stream.getVideoTracks().forEach((tr) => (tr.onended = () => stopScreen()));
    showSource(stream, "screen");
  }

  async function toggleCamera() {
    if (source === "camera") {
      stopCamera();
      return;
    }
    try {
      await startCamera();
    } catch {
      setError("कैमरा नहीं खुल पाया। अनुमति जांचें।");
    }
  }

  // ---- फ़्रेम भेजना (कैमरा या स्क्रीन, जो चालू हो) ----

  function startFrames() {
    if (timerRef.current) return;
    const canvas = document.createElement("canvas");
    const g = canvas.getContext("2d");
    timerRef.current = window.setInterval(() => {
      const video = previewRef.current;
      const kind = sourceRef.current;
      const session = sessionRef.current;
      if (!g || !video || !kind || !session || video.readyState < 2) return;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;
      const max = kind === "screen" ? SCREEN_MAX_SIDE : CAM_MAX_SIDE;
      const scale = Math.min(1, max / Math.max(vw, vh));
      canvas.width = Math.round(vw * scale);
      canvas.height = Math.round(vh * scale);
      g.drawImage(video, 0, 0, canvas.width, canvas.height);
      const jpg = canvas.toDataURL("image/jpeg", JPEG_QUALITY).split(",")[1];
      if (jpg) session.sendRealtimeInput({ media: { data: jpg, mimeType: "image/jpeg" } });
    }, FRAME_MS);
  }

  // ---- शुरू और बंद ----

  // सब कुछ बंद करें (बार-बार चलने पर भी सुरक्षित)
  function teardown() {
    const session = sessionRef.current;
    sessionRef.current = null;
    session?.close();

    micRef.current?.stream.getTracks().forEach((tr) => tr.stop());
    micRef.current?.ctx.close().catch(() => {});
    micRef.current = null;

    stopCamera();
    stopScreen();

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;

    stopPlayback();
    playCtxRef.current?.close().catch(() => {});
    playCtxRef.current = null;

    mutedRef.current = false;
    setMuted(false);
    setShowWarn(false);
    setStatus((s) => (s === "error" ? s : "idle"));
  }

  function fail(message: string) {
    setError(message);
    setStatus("error");
    teardown();
  }

  async function start() {
    setError("");
    setLog([]);
    setStatus("connecting");
    try {
      const res = await fetch("/api/live/token", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "Live शुरू नहीं हो पाया");

      playCtxRef.current = new AudioContext({ sampleRate: OUT_RATE });
      await playCtxRef.current.resume();

      const ai = new GoogleGenAI({ apiKey: data.token, httpOptions: { apiVersion: "v1alpha" } });
      const session = await ai.live.connect({
        model: data.model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: buildPrompt(shop),
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => setStatus("live"),
          onmessage: handleMessage,
          onerror: (e: ErrorEvent) => fail(e.message || "कनेक्शन में गड़बड़ी"),
          onclose: () => teardown(),
        },
      });
      sessionRef.current = session;

      await startMic(session);
      startFrames();
    } catch (err) {
      fail(err instanceof Error ? err.message : "कुछ गड़बड़ हुई");
    }
  }

  useEffect(() => () => teardown(), []);

  const isLive = status === "live" || status === "connecting";
  const shopLine = shop
    ? `${t.shop}: ${shop.name} · ${lang === "en" ? shop.category : CATEGORY_HI[shop.category] ?? shop.category}`
    : t.noShop;

  const statusText =
    status === "connecting"
      ? t.connecting
      : status === "live"
        ? muted
          ? t.muted
          : t.listening
        : status === "error"
          ? t.error
          : t.idle;

  const live = status === "live";
  const busy = status === "connecting";
  const greet = shop
    ? lang === "en" ? `Hi ${shop.name}` : `नमस्ते, ${shop.name}`
    : lang === "en" ? "Hi there" : "नमस्ते";
  const prompt = lang === "en" ? "Let's get into it" : "चलिए, बात करते हैं";
  const pillText = busy ? t.connecting : live ? (muted ? t.muted : t.listening) : t.start;

  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "#000", color: "#fff", position: "relative", overflow: "hidden", boxSizing: "border-box" }}>
      <style>{`@keyframes sthPulse{0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.07);opacity:1}}@keyframes sthGlow{0%{background-position:0% 50%}100%{background-position:100% 50%}}`}</style>

      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,#000 45%,#0b1f55 100%)", pointerEvents: "none" }} />

      <header style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 0" }}>
        <span style={{ fontSize: 18, fontWeight: 600 }}>Sthamly</span>
        <button type="button" onClick={() => setShowLog((v) => !v)} aria-label={t.transcript} style={iconBtn(false)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
        </button>
      </header>

      <section style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 20px", textAlign: "center" }}>
        <video
          ref={previewRef}
          muted
          playsInline
          style={{ width: "100%", maxHeight: "55vh", borderRadius: 20, background: "#111", display: source ? "block" : "none", marginBottom: 12 }}
        />

        {!source && (
          <>
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: "50%",
                background: "conic-gradient(from 180deg,#4285f4,#9b72cb,#d96570,#f5a623,#34a853,#4285f4)",
                opacity: busy ? 0.6 : live ? 1 : 0.85,
                animation: live && !muted ? "sthPulse 2.4s ease-in-out infinite" : "none",
                filter: live && !muted ? "blur(0px)" : "blur(0px)",
              }}
            />
            <h2 style={{ fontSize: 28, fontWeight: 500, margin: "32px 0 4px", color: "#e8eaed" }}>{greet}</h2>
            <p style={{ fontSize: 28, fontWeight: 500, margin: 0, color: "#7d8590" }}>{prompt}</p>
            <p style={{ fontSize: 13, color: "#7d8590", margin: "14px 0 0" }}>{shopLine}</p>
          </>
        )}
      </section>

      {showLog && (
        <div role="region" aria-label={t.transcript} style={{ position: "absolute", top: 56, left: 12, right: 12, bottom: 150, background: "rgba(20,22,28,.97)", borderRadius: 18, padding: 14, overflowY: "auto", zIndex: 5 }}>
          <p style={{ fontWeight: 600, margin: "0 0 10px" }}>{t.transcript}</p>
          {log.length === 0 && <p style={{ color: "#7d8590", fontSize: 14 }}>{t.privacy}</p>}
          <div style={{ display: "grid", gap: 8 }}>
            {log.map((m, i) => (
              <div key={i} style={{ justifySelf: m.role === "you" ? "end" : "start", background: m.role === "you" ? "#2b3440" : "#1c2a44", padding: "8px 12px", borderRadius: 14, fontSize: 15, maxWidth: "85%", whiteSpace: "pre-wrap" }}>
                <b style={{ color: "#9aa0a6" }}>{m.role === "you" ? `${t.you}: ` : `${t.ai}: `}</b>
                {m.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {showWarn && (
        <div role="dialog" aria-label={t.warnTitle} style={{ position: "absolute", left: 14, right: 14, bottom: 150, background: "#1f2328", border: "1px solid #3c4043", borderRadius: 18, padding: 16, zIndex: 6 }}>
          <p style={{ margin: "0 0 8px", fontWeight: 700 }}>{t.warnTitle}</p>
          <p style={{ margin: "0 0 14px", fontSize: 14, color: "#c4c7c5" }}>{t.warnText}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => startScreen().catch(() => setError(t.noSupport))} style={btn("#8ab4f8", "#0b1f55")}>{t.warnOk}</button>
            <button type="button" onClick={() => setShowWarn(false)} style={btn("#3c4043", "#e8eaed")}>{t.cancel}</button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" style={{ position: "absolute", left: 14, right: 14, bottom: 150, background: "#3c1d1d", color: "#f5b5b5", borderRadius: 14, padding: "10px 14px", fontSize: 14, zIndex: 6 }}>
          {error}
          {status === "error" && (
            <button type="button" onClick={start} style={{ marginLeft: 10, background: "none", border: "none", color: "#8ab4f8", fontWeight: 600, cursor: "pointer" }}>{t.retry}</button>
          )}
        </div>
      )}

      <footer style={{ position: "relative", padding: "12px 14px 24px" }}>
        <p style={{ fontSize: 11, color: "#7d8590", textAlign: "center", margin: "0 0 10px" }}>{t.privacy}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#1f2328", borderRadius: 999, padding: 8 }}>
          <button type="button" onClick={() => toggleCamera()} disabled={busy} aria-label={t.camera} style={iconBtn(source === "camera")}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3z" /></svg>
          </button>
          <button type="button" onClick={() => (source === "screen" ? stopScreen() : setShowWarn(true))} disabled={busy} aria-label={t.screen} style={iconBtn(source === "screen")}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M12 13V8M9 11l3-3 3 3M8 20h8" /></svg>
          </button>
          <button
            type="button"
            onClick={() => { if (!live && !busy) start(); }}
            disabled={live || busy}
            style={{ flex: 1, height: 56, borderRadius: 999, border: "none", color: "#fff", fontSize: 16, fontWeight: 600, cursor: live || busy ? "default" : "pointer", background: "linear-gradient(90deg,#1f2328,#0b1f55,#4285f4,#1f2328)", backgroundSize: "200% 100%", animation: live ? "sthGlow 3s linear infinite" : "none" }}
          >
            {pillText}
          </button>
          {live && (
            <button type="button" onClick={toggleMute} aria-label={muted ? t.unmute : t.mute} style={iconBtn(muted)}>
              {muted ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l18 18M9 9v2a3 3 0 0 0 5 2.2M15 9V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.5 5.3M12 18v3" /></svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
              )}
            </button>
          )}
          {(live || busy) && (
            <button type="button" onClick={teardown} aria-label={t.end} style={iconBtn(false, "#b3261e")}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          )}
        </div>
      </footer>
    </main>
  );
}

function btn(bg: string, color = "#fff"): CSSProperties {
  return {
    background: bg,
    color,
    border: "none",
    borderRadius: 10,
    padding: "10px 16px",
    fontSize: 15,
    cursor: "pointer",
  };
}

function iconBtn(active: boolean, bg?: string): CSSProperties {
  return {
    width: 56,
    height: 56,
    minWidth: 56,
    borderRadius: "50%",
    border: "none",
    background: bg ?? (active ? "#e8eaed" : "#2b3035"),
    color: active && !bg ? "#111" : "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  };
}
