"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
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

// फ़ोटो की अधिकतम साइज़ (10 MB)
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

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
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function ClipIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
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
  // चुनी हुई फ़ोटो (अभी backend को नहीं जाती, अगले कदम में जुड़ेगी)
  const [photo, setPhoto] = useState<File | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const idRef = useRef(0);
  const endRef = useRef<HTMLDivElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

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

    if (said.length