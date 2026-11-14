"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { UpgradeSheet } from "@/components/billing/UpgradeSheet";
import { MessageActions } from "@/components/voice/MessageActions";
import styles from "@/components/voice/VoiceAssistant.module.css";
import { upcomingFestivals, type UpcomingFestival } from "@/lib/festivals";
import type { Lang } from "@/lib/i18n";
import { LABELS } from "@/lib/labels";
import { formatRupees } from "@/lib/pricing";

export interface AssistantQuota {
  posterLeft: number;
  posterWindow: "day" | "week" | "month";
  walletPaise: number;
}

// सुझावों के आइकन (वाक्य lib/labels.ts में, दोनों भाषाओं में)
type SuggestionIcon = "spark" | "image" | "pencil";
const SUGGESTION_ICONS: SuggestionIcon[] = ["spark", "image", "pencil", "spark"];

// फ़ोटो की अधिकतम साइज़ (10 MB)
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

interface Offer {
  offerText: string;
  occasion: string | null;
}

type Kind = "poster" | "reel";
type Busy = "idle" | "transcribing" | "replying" | "parsing";

// पुरानी बातचीत खोलते समय सर्वर से आए संदेश
export interface InitialMessage {
  role: "user" | "assistant";
  text: string;
}

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

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data.error?.message ?? fallback;
  } catch {
    return fallback;
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

function SuggestionGlyph({ icon }: { icon: SuggestionIcon }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (icon === "image") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="M4 18l5-5 4 4 3-3 4 4" />
      </svg>
    );
  }
  if (icon === "pencil") {
    return (
      <svg {...common}>
        <path d="M4 20l1-4L17 4l3 3L8 19z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 16v4M17 18h4" />
    </svg>
  );
}

// मेन्यू का बटन भी लिंक जैसा दिखे (बॉर्डर और बैकग्राउंड हटा दिए)
const MENU_BUTTON_RESET = {
  width: "100%",
  border: "none",
  background: "none",
  textAlign: "left" as const,
  cursor: "pointer",
  font: "inherit",
};

function DotsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

// चैट शुरू होने के बाद ऊपर वाली गोली: नई बातचीत (पेंसिल) और मेन्यू (तीन डॉट)
const CHAT_PILL = {
  display: "flex",
  alignItems: "center",
  height: 44,
  padding: "0 2px",
  borderRadius: 999,
  border: "1px solid var(--line, #e5e5e5)",
  background: "var(--surface, #fff)",
};

const PILL_BTN = {
  width: 40,
  height: 40,
  border: "none",
  borderRadius: 999,
  background: "transparent",
  color: "var(--ink, #1c1917)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const PILL_DIVIDER = {
  width: 1,
  height: 20,
  background: "var(--line, #e5e5e5)",
};

export function VoiceAssistant({
  name,
  loggedIn,
  quota,
  lang = "hi",
  initialThreadId = null,
  initialMessages = [],
}: {
  name: string;
  loggedIn: boolean;
  quota: AssistantQuota | null;
  lang?: Lang;
  initialThreadId?: string | null;
  initialMessages?: InitialMessage[];
}) {
  const router = useRouter();
  const t = LABELS[lang].va;
  const windowLabel = { day: t.windowDay, week: t.windowWeek, month: t.windowMonth };
  // पुरानी बातचीत खुली हो तो उसके संदेश पहले से भरे (id 1, 2, 3…)
  const [messages, setMessages] = useState<Message[]>(() =>
    initialMessages.map((m, i) => ({ id: i + 1, role: m.role, text: m.text })),
  );
  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [busy, setBusy] = useState<Busy>("idle");
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  // चुनी हुई फ़ोटो (अभी backend को नहीं जाती, अगले कदम में जुड़ेगी)
  const [photo, setPhoto] = useState<File | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // लिखने की जगह दबी हो (कीबोर्ड खुला) तो सुझाव छिप जाते हैं, ताकि ऊपर का हिस्सा दिखता रहे
  const [focused, setFocused] = useState(false);
  // आने वाले त्योहार और दिवस (तारीख़ browser में निकलती है, ताकि दिन सही रहे)
  const [festivals, setFestivals] = useState<UpcomingFestival[]>([]);
  // "बढ़ाएँ" शीट: बटन से या सीमा पूरी होने पर अपने-आप खुलती है
  const [sheetOpen, setSheetOpen] = useState(false);
  const [limitHit, setLimitHit] = useState(false);

  const idRef = useRef(initialMessages.length);
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

  // नई बातचीत शुरू: पुराना सब साफ़, इतिहास में पुरानी चैट बनी रहती है
  function startNewChat() {
    if (recording) return;
    setMessages([]);
    setThreadId(null);
    setDraft("");
    setError(null);
    setPhoto(null);
    window.history.replaceState(null, "", "/voice");
  }

  useEffect(() => {
    setFestivals(upcomingFestivals(new Date(), lang));
  }, [lang]);

  // नया संदेश आने पर सबसे नीचे दिखाएं
  // खाली स्क्रीन पर नहीं सरकाते, वरना ऊपर का हिस्सा (नाम, गोला) बाहर चला जाता है
  useEffect(() => {
    if (messages.length === 0) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  // जवाब माँगना। regenerate=true हो तो वही सवाल दोबारा, इतिहास में सवाल दोबारा नहीं जुड़ता।
  async function requestReply(history: { role: "user" | "assistant"; content: string }[], regenerate: boolean) {
    setBusy("replying");
    try {
      const res = await fetch("/api/voice/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(threadId ? { threadId } : {}), messages: history, ...(regenerate ? { regenerate: true } : {}) }),
      });
      if (res.status === 402) {
        // आज की मुफ़्त सीमा पूरी: बढ़ाएँ शीट खोलें
        setLimitHit(true);
        setSheetOpen(true);
        setError(await readError(res, LABELS[lang].up.limitBody));
        return;
      }
      if (!res.ok) {
        setError(await readError(res, t.errGeneric));
        return;
      }
      const data = (await res.json()) as { reply: string; threadId?: string | null };
      setMessages((prev) => [...prev, { id: newId(), role: "assistant", text: data.reply }]);
      // नई बातचीत बनी: पता में उसकी id रखें, ताकि पेज दोबारा खुलने पर वही चैट खुले
      if (data.threadId && data.threadId !== threadId) {
        setThreadId(data.threadId);
        window.history.replaceState(null, "", `/voice?chat=${data.threadId}`);
      }
    } catch {
      setError(t.errNetwork);
    } finally {
      setBusy("idle");
    }
  }

  function toHistory(list: Message[]) {
    return list
      .filter((m) => !m.offerCard && m.text.trim().length > 0)
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.text.slice(0, 1000) }));
  }

  // चैट से जवाब लेना। इतिहास में ऑफ़र कार्ड शामिल नहीं होते, सिर्फ़ बात-चीत।
  async function sendText(raw: string) {
    const text = raw.trim();
    if (text.length < 2) {
      setError(t.errWriteOrSpeak);
      return;
    }
    if (!loggedIn) {
      setError(t.needLogin);
      return;
    }
    setError(null);

    const userMsg: Message = { id: newId(), role: "user", text };
    const history = toHistory([...messages, userMsg]);
    setMessages((prev) => [...prev, userMsg]);
    await requestReply(history, false);
  }

  // आखिरी जवाब हटाकर उसी सवाल का नया जवाब
  async function retryLast() {
    if (busy !== "idle") return;
    const lastBot = [...messages].reverse().find((m) => m.role === "assistant" && !m.offerCard);
    if (!lastBot) return;
    const rest = messages.filter((m) => m.id !== lastBot.id);
    if (rest.length === 0 || rest[rest.length - 1]?.role !== "user") return;
    setError(null);
    setMessages(rest);
    await requestReply(toHistory(rest), true);
  }

  // इस जवाब तक की बातचीत से नई बातचीत शुरू (पुरानी जैसी की तैसी रहती है)
  function branchFrom(id: number) {
    const at = messages.findIndex((m) => m.id === id);
    if (at < 0) return;
    setMessages(messages.slice(0, at + 1));
    setThreadId(null);
    setDraft("");
    setError(null);
    window.history.replaceState(null, "", "/voice");
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
        setError(await readError(res, t.errGeneric));
        return;
      }
      const data = (await res.json()) as { offer: Offer | null };
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "assistant", text: "", offerCard: { offer: data.offer } },
      ]);
    } catch {
      setError(t.errNetwork);
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
        setError(await readError(res, t.errGeneric));
        return;
      }
      const data = (await res.json()) as { text: string };
      said = data.text.trim();
    } catch {
      setError(t.errNetwork);
      return;
    } finally {
      setBusy("idle");
    }

    if (said.length < 3) {
      setError(t.errUnclear);
      return;
    }
    await sendText(said);
  }

  async function startRecording() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError(t.errNoRecording);
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
      setError(t.errMic);
    }
  }

  function stopRecording() {
    setRecording(false);
    recorderRef.current?.stop();
  }

  // फ़ोटो या कैमरा से चुनी फ़ोटो
  function onPickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    // एक ही फ़ोटो दोबारा चुनी जा सके, इसलिए input खाली कर दें
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t.errPhotoOnly);
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError(t.errPhotoBig);
      return;
    }
    setError(null);
    setPhoto(file);
  }

  function onSend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = draft.trim();
    if (value.length < 2) {
      setError(t.errWrite);
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

  // चैट से बाहर निकलना: पिछले पन्ने पर, वरना होम पर
  function leaveChat() {
    setMenuOpen(false);
    if (window.history.length > 1) router.back();
    else router.push("/");
  }

  const leaveLabel = lang === "en" ? "Leave chat" : "बाहर निकलें";

  const isEmpty = messages.length === 0;
  const hasDraft = draft.trim().length > 0;
  const status = recording
    ? t.statusListening
    : busy === "transcribing"
      ? t.statusTranscribing
      : busy === "replying"
        ? t.statusReplying
        : busy === "parsing"
          ? t.statusParsing
          : "";

  // तीन डॉट का मेन्यू (खुला हो तभी बनता है)
  const menuNode = menuOpen ? (
    <div className={styles.menu} role="menu">
      <Link
        href="/my-posters"
        className={styles.menuItem}
        role="menuitem"
        onClick={() => setMenuOpen(false)}
      >
        {t.myWork}
      </Link>
      <Link
        href="/settings"
        className={styles.menuItem}
        role="menuitem"
        onClick={() => setMenuOpen(false)}
      >
        {t.settings}
      </Link>
      {!isEmpty && (
        <button
          type="button"
          className={styles.menuItem}
          role="menuitem"
          style={MENU_BUTTON_RESET}
          onClick={leaveChat}
        >
          {leaveLabel}
        </button>
      )}
    </div>
  ) : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <div className={styles.title}>{t.title}</div>
          <div className={styles.subtitle}>{t.subtitle}</div>
        </div>

        {loggedIn && (
          <div className={styles.topActions}>
            <button
              type="button"
              className={styles.boost}
              onClick={() => {
                setLimitHit(false);
                setSheetOpen(true);
              }}
            >
              {t.boost}
            </button>
            {isEmpty ? (
              <div className={styles.menuWrap}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label={t.more}
                  aria-expanded={menuOpen}
                >
                  <DotsIcon />
                </button>
                {menuNode}
              </div>
            ) : (
              <div className={styles.menuWrap} style={CHAT_PILL}>
                <button
                  type="button"
                  style={PILL_BTN}
                  onClick={() => {
                    setMenuOpen(false);
                    startNewChat();
                  }}
                  disabled={recording}
                  aria-label={t.newChat}
                  title={t.newChat}
                >
                  <PencilIcon />
                </button>
                <span aria-hidden style={PILL_DIVIDER} />
                <button
                  type="button"
                  style={PILL_BTN}
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label={t.more}
                  aria-expanded={menuOpen}
                >
                  <DotsIcon />
                </button>
                {menuNode}
              </div>
            )}
          </div>
        )}
      </header>

      {quota && (
        <button
          type="button"
          className={styles.quota}
          aria-live="polite"
          onClick={() => {
            setLimitHit(false);
            setSheetOpen(true);
          }}
        >
          <span>
            {windowLabel[quota.posterWindow]} {t.postersLeft}: {quota.posterLeft}
          </span>
          <span>{t.wallet}: {formatRupees(quota.walletPaise)}</span>
        </button>
      )}

      <section className={`${styles.stage} ${isEmpty ? styles.stageEmpty : ""}`}>
        {isEmpty && (
          <>
            <div
              aria-hidden
              className={`${styles.orb} ${recording ? styles.orbListening : ""} ${busy !== "idle" ? styles.orbBusy : ""}`}
            />
            <h1 className={styles.greeting}>{t.hello}, {name}</h1>
            <p className={styles.question}>{t.question}</p>
            <p className={styles.hint}>
              {loggedIn ? t.hintIn : t.hintOut}
            </p>
            {!loggedIn && (
              <Link href="/login?next=/voice" className={styles.loginBtn}>
                {t.login}
              </Link>
            )}
            {loggedIn && (
              <Link href="/live" className={styles.livePill}>
                <span className={styles.liveDot} aria-hidden />
                {t.goLive}
              </Link>
            )}
            {!focused && !hasDraft && (
              <div className={styles.suggestions}>
                {festivals.map((f) => (
                  <button
                    key={f.name}
                    type="button"
                    className={styles.suggestion}
                    onClick={() => {
                      setDraft(f.prompt);
                      setError(null);
                    }}
                    disabled={recording || busy !== "idle"}
                  >
                    <span className={styles.suggestionIcon}>
                      <SuggestionGlyph icon="spark" />
                    </span>
                    {f.name} ({f.when})
                  </button>
                ))}
                {t.suggestions.map((sg, i) => (
                  <button
                    key={sg.label}
                    type="button"
                    className={styles.suggestion}
                    onClick={() => {
                      setDraft(sg.prompt);
                      setError(null);
                    }}
                    disabled={recording || busy !== "idle"}
                  >
                    <span className={styles.suggestionIcon}>
                      <SuggestionGlyph icon={SUGGESTION_ICONS[i] ?? "spark"} />
                    </span>
                    {sg.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {messages.map((m) => {
          if (m.role === "user") {
            return (
              <div key={m.id} className={styles.userWrap}>
                <div className={styles.bubbleUser}>{m.text}</div>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => void makeOffer(m.text)}
                  disabled={busy !== "idle"}
                >
                  {t.makeOffer}
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
                    <p className={styles.label}>{t.offerUnderstood}</p>
                    <p className={styles.offerText}>{offer.offerText}</p>
                    {offer.occasion && <p className={styles.muted}>{t.occasion}: {offer.occasion}</p>}
                    <div className={styles.btnRow}>
                      <button type="button" className={styles.btnPrimary} onClick={() => chooseOffer(offer, "poster")}>
                        {t.makePoster}
                      </button>
                      <button type="button" className={styles.btnGhost} onClick={() => chooseOffer(offer, "reel")}>
                        {t.makeReel}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className={styles.muted}>{t.offerUnclear}</p>
                )}
              </div>
            );
          }

          const lastBotId = [...messages].reverse().find((x) => x.role === "assistant" && !x.offerCard)?.id;
          return (
            <div key={m.id} className={styles.bubbleBot}>
              <p className={styles.botText}>{m.text}</p>
              <MessageActions
                text={m.text}
                lang={lang}
                isLast={m.id === lastBotId}
                busy={busy !== "idle"}
                onRetry={() => void retryLast()}
                onBranch={() => branchFrom(m.id)}
                onShorter={() => void sendText(t.shorter)}
                onSimpler={() => void sendText(t.simpler)}
                onPoster={() => void makeOffer(m.text.slice(0, 600))}
                onNewChat={startNewChat}
              />
            </div>
          );
        })}

        <div ref={endRef} />
      </section>

      <div className={styles.composer}>
        {error && <p className={styles.error}>{error}</p>}
        {status && <p className={styles.status}>{status}</p>}

        {photo && (
          <div className={styles.photoChip}>
            <span className={styles.photoName}>📷 {photo.name}</span>
            <button
              type="button"
              className={styles.photoRemove}
              onClick={() => setPhoto(null)}
              aria-label={t.removePhoto}
            >
              ✕
            </button>
          </div>
        )}

        <form className={styles.row} onSubmit={onSend}>
          <div className={styles.pill}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => photoInputRef.current?.click()}
              disabled={recording || busy !== "idle"}
              aria-label={t.pickPhoto}
            >
              <ClipIcon />
            </button>

            <input
              className={styles.input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={t.placeholder}
              maxLength={1000}
              disabled={recording || busy !== "idle"}
              aria-label={t.messageAria}
            />

            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => cameraInputRef.current?.click()}
              disabled={recording || busy !== "idle"}
              aria-label={t.camera}
            >
              <CameraIcon />
            </button>
          </div>

          {hasDraft ? (
            <button
              type="submit"
              className={`${styles.micBig} ${styles.circleSend}`}
              disabled={busy !== "idle"}
              aria-label={t.send}
            >
              <SendIcon />
            </button>
          ) : (
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              disabled={busy !== "idle"}
              className={`${styles.micBig} ${recording ? styles.circleStop : ""}`}
              aria-label={recording ? t.stopRec : t.speak}
            >
              {recording ? <StopIcon /> : <MicIcon />}
            </button>
          )}
        </form>

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          onChange={onPickPhoto}
          hidden
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPickPhoto}
          hidden
        />
      </div>

      <UpgradeSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setLimitHit(false);
        }}
        lang={lang}
        limitReached={limitHit}
      />
    </div>
  );
}