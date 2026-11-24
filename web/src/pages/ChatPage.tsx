// Sthamly AI web: chat screen (Blueprint 3.0 section 6, 10; guest mode; creation link)
// Guest (login nahi): chat khuli hai, din ke limited messages, chat server par save nahi.
// Login user: history DB mein, conversation list, usage, mic (push-to-talk).
// Creation (image, slides, website, document) /create par hai. Yahan se link hai.
// Raw server ya provider error nahi dikhta, sirf Hindi message.

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  ApiClientError,
  deleteConversation,
  getProfile,
  isLoginRequired,
  listConversations,
  listMessages,
  streamChat,
  updateProfile,
  type ChatTurn,
  type ConversationSummary,
  type ProfileResponse,
  type ProfileView,
  type StoredMessage,
} from "../api/client";
import { PushToTalkButton } from "../voice/PushToTalkButton";
import { ErrorPanel } from "../components/ErrorPanel";
import { ExpertFab } from "../components/ExpertFab";
import { PartnerHome, type PartnerAction } from "../components/PartnerHome";
import {
  autoRetryDelay,
  friendlyFromApi,
  friendlyFromMic,
  isNetworkError,
  type FriendlyError,
} from "../lib/friendlyError";
import { enqueue, readOutbox, removeFromOutbox } from "../lib/outbox";
import { applyPrefs, readPrefs, writePrefs, type Prefs, type TextSize } from "../lib/prefs";
import { ChatSidebar } from "../components/ChatSidebar";
import {
  isSupportedLanguage,
  readGuestLanguage,
  writeGuestLanguage,
} from "../lib/languages";
import { findMode, type ModeKey } from "../lib/modes";
import { ModeChips, Suggestions } from "../components/ModeBar";
import { MessageActions } from "../components/MessageActions";
import { Markdown } from "../components/Markdown";
import "../components/HomeCalm.css";
import { ComposerChip, ComposerPlus } from "../components/ComposerPlus";
import { ImageViewer } from "../components/ImageViewer";
import { AiImageBlock, UserAttachment, type MessageAttachment } from "../components/ChatMedia";
import { editImageInChat, type ImageIntent } from "../api/imageChat";
import { askDocument } from "../api/documentChat";
import {
  fileToAttachment,
  imageToAttachment,
  type Attachment,
} from "../lib/attachment";

const CONVERSATION_PAGE = 30;
const HISTORY_LIMIT = 20;
const MAX_INPUT_CHARS = 4000;
const TITLE_CHARS = 40;

// Worker (guest.ts) ki limit se same rakhein. Ye sirf screen par dikhane aur pehle rokne ke liye hai.
// Asli limit Worker lagata hai, isliye browser mein counter badalne se limit nahi tootti.
const GUEST_MESSAGES_PER_DAY = 3;
const GUEST_USAGE_KEY = "sthamly_guest_usage";

interface DisplayMessage {
  key: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  stopped?: boolean;
  // User ne jo tasveer ya PDF bheji (sirf dikhane ke liye).
  attachment?: MessageAttachment;
  // AI ne jo tasveer banayi (signed link).
  image?: string;
  // Banne ke dauran dikhne wali status line (sirf pending sandesh mein).
  status?: string;
}

// Role (mode) ke hisaab se tasveer aur PDF ke prompt mein chhota sandarbh.
const MODE_HINT: Record<ModeKey, string> = {
  general: "",
  shop: "दुकान के प्रचार के लिए साफ़, आकर्षक और सही लगने वाला बनाओ। ",
  study: "पढ़ाई के लिए साफ़, सीधा और आसानी से समझ आने वाला रखो। ",
  legal: "सरकारी या कानूनी कागज़ जैसा साफ़, सादा और व्यवस्थित रखो। ",
  creator: "सोशल मीडिया के लिए आकर्षक और ध्यान खींचने वाला बनाओ। ",
};

interface GuestUsage {
  day: string;
  count: number;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

const TEXT_SIZES: TextSize[] = ["normal", "large", "xlarge"];
const TEXT_SIZE_LABEL: Record<TextSize, string> = {
  normal: "सामान्य अक्षर",
  large: "बड़े अक्षर",
  xlarge: "बहुत बड़े अक्षर",
};

function errorText(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  return "कुछ गड़बड़ हो गई। दोबारा कोशिश करें।";
}

function toDisplay(m: StoredMessage): DisplayMessage {
  return {
    key: m.id,
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  };
}

function titleFrom(text: string): string {
  return Array.from(text.trim()).slice(0, TITLE_CHARS).join("");
}

// Din ke samay ke hisaab se shuruaati shabd (phone ke local samay se).
function greetingNow(now: Date = new Date()): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "सुप्रभात!";
  if (h >= 17 && h < 21) return "शुभ संध्या!";
  return "नमस्ते!";
}

// Aaj ka UTC din, jaise 2026-11-19. Worker ke din se match karta hai.
function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function isGuestUsage(value: unknown): value is GuestUsage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.day === "string" && typeof v.count === "number";
}

// Storage band ho to memory mein rakhte hain, taaki ek session mein count na bhoole.
let memoryGuestUsage: GuestUsage | null = null;

// Guest ne aaj kitne messages bheje (is device par).
function readGuestCount(): number {
  const today = utcDay();
  try {
    const raw = window.localStorage.getItem(GUEST_USAGE_KEY);
    if (raw === null) return 0;
    const parsed: unknown = JSON.parse(raw);
    return isGuestUsage(parsed) && parsed.day === today ? parsed.count : 0;
  } catch {
    return memoryGuestUsage !== null && memoryGuestUsage.day === today
      ? memoryGuestUsage.count
      : 0;
  }
}

function writeGuestCount(count: number): void {
  const value: GuestUsage = { day: utcDay(), count };
  memoryGuestUsage = value;
  try {
    window.localStorage.setItem(GUEST_USAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage nahi chal rahi: memory mein count already hai.
  }
}

export function ChatPage() {
  const { status, user, getAccessToken, signOut } = useAuth();
  const navigate = useNavigate();
  const { conversationId: routeId } = useParams<{ conversationId: string }>();
  const activeId: string | null = routeId ?? null;

  const isGuest = status === "signed_out";
  const isMember = status === "signed_in";

  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [plan, setPlan] = useState<ProfileResponse["plan"] | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  // Saaf error panel (friendlyError) aur purana chhota error. setError dono ko saaf karta hai.
  const [errorInfo, setErrorInfo] = useState<FriendlyError | null>(null);
  const [error, setErrorRaw] = useState<string | null>(null);
  function setError(value: string | null): void {
    setErrorInfo(null);
    setErrorRaw(value);
  }
  // Bada akshar aur partner mode: device par yaad rehta hai.
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [guestUsed, setGuestUsed] = useState<number>(() => readGuestCount());
  // Profile dobara load karne ke liye: badalne par profile effect phir chalta hai.
  const [profileRetry, setProfileRetry] = useState(0);
  // Guest ki bhasha is device par. Login user ki bhasha profile se aati hai.
  const [guestLang, setGuestLang] = useState<string>(() => readGuestLanguage());
  const currentLang: string = isMember && profile !== null ? profile.language : guestLang;
  // Role mode (सामान्य, दुकान, …). Abhi sirf screen par; server ko bhejna agle kadam mein.
  const [mode, setMode] = useState<ModeKey>("general");
  // Chat mein bhejne ke liye chuni hui tasveer ya PDF (composer ke chip mein dikhti hai).
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  // Edit button se chuni tasveer ho to agla sandesh edit hoga.
  const [editNext, setEditNext] = useState(false);
  // Jo AI ki tasveer full-screen dekhi ja rahi hai.
  const [viewing, setViewing] = useState<{ src: string; alt: string } | null>(null);

  // Chal rahi request ka controller. Stop, chat badalne aur screen band hone par abort hota hai.
  const abortRef = useRef<AbortController | null>(null);
  // Kaunsi conversation ke messages abhi loaded hain. Naya chat bante hi reload se bachne ke liye.
  const loadedIdRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  // Composer ka textarea: user ka sawal badalne ke liye usi par focus jaata hai.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Aakhri bheja sawal (dobara bhejne ke liye), auto retry ki ginti, aur messages ka latest version.
  const lastSendRef = useRef<{ text: string; base: DisplayMessage[] } | null>(null);
  const retryCountRef = useRef(0);
  const messagesRef = useRef<DisplayMessage[]>(messages);
  messagesRef.current = messages;
  const flushRef = useRef<() => void>(() => undefined);
  flushRef.current = flushOutbox;

  // Prefs ko document par lagao aur yaad rakho.
  useEffect(() => {
    applyPrefs(prefs);
    writePrefs(prefs);
  }, [prefs]);

  // Saaf error par thodi der baad apne-aap dobara (sirf 503 / seva vyast jaisi dikkat par).
  useEffect(() => {
    if (errorInfo === null || !errorInfo.autoRetry) return;
    const delay = autoRetryDelay(retryCountRef.current);
    if (delay === null) return;
    const id = window.setTimeout(() => {
      retryCountRef.current += 1;
      handleRetry();
    }, delay);
    return () => window.clearTimeout(id);
  }, [errorInfo]);

  // Net wapas aaya ya login hone par: outbox ke sandesh jaate hain.
  useEffect(() => {
    const onOnline = (): void => flushRef.current();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const guestLeft = Math.max(0, GUEST_MESSAGES_PER_DAY - guestUsed);
  const guestBlocked = isGuest && guestLeft === 0;
  // Guest hamesha tayyar. Login user ke liye profile load hona zaroori hai.
  const ready = isGuest || (isMember && profile !== null);
  // Login user ki profile aate hi outbox ka pehla sandesh (agar pehle se pada hai).
  useEffect(() => {
    if (ready && isMember) flushRef.current();
  }, [ready, isMember]);
  const canSend =
    ready && !guestBlocked && (input.trim().length > 0 || attachment !== null) && !sending;
  // "दोबारा बनाएँ" abhi sirf wahin, jahan chat server par save nahi hoti (guest, ya history band).
  // Saved chat mein dobara banane par purana jawab DB mein rehta, isliye wahan nahi dikhate.
  const canRegenerate =
    !sending && (isGuest || (isMember && profile !== null && !profile.history_enabled));

  // Login user ka token. Nahi hai to 'unauthenticated' (sirf member ke kaam ke liye).
  async function authToken(): Promise<string> {
    const token = await getAccessToken();
    if (!token) {
      throw new ApiClientError("unauthenticated", "पहले लॉग-इन करें।", false, null);
    }
    return token;
  }

  // Screen band hone par chalti request bhi band.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Guest ka din ka count storage se (guest mode mein aate hi).
  useEffect(() => {
    if (isGuest) setGuestUsed(readGuestCount());
  }, [isGuest]);

  // Login badle (login ya logout): pichhli screen ka chat saaf. Guest ki chat login par nahi jaati.
  useEffect(() => {
    abortRef.current?.abort();
    loadedIdRef.current = null;
    setMessages([]);
    setInput("");
    setError(null);
  }, [status, user?.id]);

  // Login user ka profile aur conversation list. Guest ke liye ye calls nahi hoti.
  useEffect(() => {
    if (!isMember) {
      setProfile(null);
      setPlan(null);
      setConversations([]);
      setNextCursor(null);
      return;
    }

    const ctrl = new AbortController();

    (async () => {
      try {
        const token = await authToken();
        const res = await getProfile(token, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setProfile(res.profile);
        setPlan(res.plan);

        if (res.profile.history_enabled) {
          const list = await listConversations(token, { limit: CONVERSATION_PAGE }, ctrl.signal);
          if (ctrl.signal.aborted) return;
          setConversations(list.conversations);
          setNextCursor(list.next_cursor);
        } else {
          setConversations([]);
          setNextCursor(null);
        }
      } catch (err) {
        if (isAbort(err)) return;
        setError(errorText(err));
      }
    })();

    return () => ctrl.abort();
  }, [isMember, user?.id, profileRetry]);

  // Route badalne par messages load karna (sirf login user, history on ho to).
  useEffect(() => {
    if (status === "loading") return;

    abortRef.current?.abort();

    if (activeId === null) {
      loadedIdRef.current = null;
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    // Guest ke paas saved conversation nahi hoti: /chat par bhejo.
    if (!isMember) {
      navigate("/chat", { replace: true });
      return;
    }

    if (profile === null) return;

    if (!profile.history_enabled) {
      navigate("/chat", { replace: true });
      return;
    }

    // Naya chat abhi bana ho to messages pehle se screen par hain, dobara load nahi karte.
    if (loadedIdRef.current === activeId) return;

    const ctrl = new AbortController();
    setLoadingMessages(true);
    setError(null);

    (async () => {
      try {
        const token = await authToken();
        const res = await listMessages(token, activeId, ctrl.signal);
        if (ctrl.signal.aborted) return;
        loadedIdRef.current = activeId;
        setMessages(res.messages.filter((m) => m.role !== "system").map(toDisplay));
      } catch (err) {
        if (isAbort(err)) return;
        setMessages([]);
        setError(errorText(err));
      } finally {
        if (!ctrl.signal.aborted) setLoadingMessages(false);
      }
    })();

    return () => ctrl.abort();
  }, [activeId, status, profile, navigate]);

  // Naye message par neeche scroll.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function handleStop(): void {
    abortRef.current?.abort();
  }

  // Bhasha: login user ka profile mein save hota hai. Guest ki pasand is device par.
  // Abhi sirf hi, hinglish, en server par chalti hain; baaki sirf dikhti hain (sidebar mein 'जल्द').
  async function handleLanguage(code: string): Promise<void> {
    if (!isSupportedLanguage(code)) return;
    if (!isMember) {
      setGuestLang(code);
      writeGuestLanguage(code);
      return;
    }
    if (profile !== null && profile.language === code) return;
    try {
      const token = await authToken();
      const res = await updateProfile(token, { language: code });
      setProfile(res.profile);
    } catch (err) {
      setError(errorText(err));
    }
  }

  function handleNewChat(): void {
    abortRef.current?.abort();
    loadedIdRef.current = null;
    setMessages([]);
    setError(null);
    setInput("");
    setSidebarOpen(false);
    navigate("/chat");
  }

  function openConversation(id: string): void {
    setError(null);
    setSidebarOpen(false);
    navigate(`/chat/${id}`);
  }

  // Profile load fail ho to dobara koshish: error saaf karke effect ko phir chalaate hain.
  function handleRetryProfile(): void {
    setError(null);
    setProfileRetry((n) => n + 1);
  }

  // Mic ki dikkat: code ho to saaf panel (chitra wali madad bhi), warna seedha message.
  function handleMicError(message: string, code?: string): void {
    if (code === undefined) {
      setError(message);
      return;
    }
    setErrorInfo(friendlyFromMic(code));
    setErrorRaw(null);
  }

  // Dobara bhejna: aakhri sawal, usi jagah se.
  function handleRetry(): void {
    const last = lastSendRef.current;
    if (last === null || sending) return;
    void handleSend({ text: last.text, base: last.base });
  }

  // Outbox ka pehla sandesh bhejta hai. Ek baar mein ek. Net na ho to kuch nahi karta.
  function flushOutbox(): void {
    if (!isMember || !ready || sending || guestBlocked) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const [first] = readOutbox();
    if (first === undefined) return;
    removeFromOutbox(first.id);
    // Net ke waqt wala bubble hata do: handleSend naya banayega (dobara nahi dikhega).
    const base = [...messagesRef.current];
    for (let i = base.length - 1; i >= 0; i -= 1) {
      const m = base[i];
      if (m !== undefined && m.role === "user" && m.content === first.text) {
        base.splice(i, 1);
        break;
      }
    }
    void handleSend({ text: first.text, base });
  }

  // Partner ke card: sawal composer mein bharta hai, partner khud badal kar bhejta hai.
  function handlePartnerAction(_action: PartnerAction, prefill: string): void {
    if (prefill.length > 0) setInput(prefill);
    textareaRef.current?.focus();
  }

  // Mic se mila text input mein jaata hai, user dekh kar bheje.
  function handleTranscript(text: string): void {
    setInput((prev) => (prev.trim().length > 0 ? `${prev.trim()} ${text}` : text));
  }