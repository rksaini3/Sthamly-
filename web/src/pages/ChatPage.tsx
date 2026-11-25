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
import { PartnerHome, type PartnerAction } from "../components/PartnerHome";
import {
  autoRetryDelay,
  friendlyFromApi,
  friendlyFromMic,
  isNetworkError,
  type FriendlyError,
} from "../lib/friendlyError";
import { enqueue, readOutbox, removeFromOutbox } from "../lib/outbox";
import { applyPrefs, readPrefs, writePrefs, type Prefs } from "../lib/prefs";
import { ChatSidebar } from "../components/ChatSidebar";
import {
  isSupportedLanguage,
  readGuestLanguage,
  writeGuestLanguage,
} from "../lib/languages";
import { findMode, type ModeKey } from "../lib/modes";
import { MessageActions } from "../components/MessageActions";
import { Markdown } from "../components/Markdown";
import { HomeTopBar } from "../components/HomeTopBar";
import { HomeToolPanel } from "../components/HomeToolPanel";
import { type HomeCategoryId, type HomeTool } from "../lib/homeTools";
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

// Home ki category chune to chat ka mode bhi wahi. Seller ke liye alag mode nahi, to 'दुकान' jaisa.
const HOME_CATEGORY_MODE: Record<HomeCategoryId, ModeKey> = {
  seller: "shop",
  general: "general",
  shop: "shop",
  creator: "creator",
  study: "study",
  legal: "legal",
};

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
  // Home ki category (tabs) aur usse judaa mode (सामान्य, दुकान, …). Server ko mode bhejte hain.
  const [homeCategory, setHomeCategory] = useState<HomeCategoryId>("general");
  const [mode, setMode] = useState<ModeKey>("general");
  // Chat mein bhejne ke liye chuni hui tasveer ya PDF (composer ke chip mein dikhti hai).
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  // Edit button se chuni tasveer ho to agla sandesh edit hoga.
  const [editNext, setEditNext] = useState(false);
  // Jo AI ki tasveer full-screen dekhi ja rahi hai.
  const [viewing, setViewing] = useState<{ src: string; alt: string } | null>(null);
  // Saved chat khuli, par usmein ek bhi sandesh nahi mila: saaf batana, khaali home jaisa nahi dikhana.
  const [convoEmpty, setConvoEmpty] = useState(false);

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
      setConvoEmpty(false);
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
        const shown = res.messages.filter((m) => m.role !== "system").map(toDisplay);
        setMessages(shown);
        setConvoEmpty(shown.length === 0);
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

  // Home ka tool card: uska shuruaati prompt composer mein jaata hai; user aage likhkar bhejta hai.
  function handlePickTool(tool: HomeTool): void {
    if (tool.prompt.length > 0) setInput(tool.prompt);
    textareaRef.current?.focus();
  }

  // Category tab badle: tool cards bhi badlein aur chat ka mode bhi.
  function handleChangeCategory(id: HomeCategoryId): void {
    setHomeCategory(id);
    setMode(HOME_CATEGORY_MODE[id]);
  }

  // Mic se mila text input mein jaata hai, user dekh kar bheje.
  function handleTranscript(text: string): void {
    setInput((prev) => (prev.trim().length > 0 ? `${prev.trim()} ${text}` : text));
  }

  // Chuni hui file (phone ki photo, camera ya PDF). Login zaroori.
  async function handleFile(file: File): Promise<void> {
    if (!isMember) {
      setError("तस्वीर या PDF भेजने के लिए लॉग-इन करें।");
      return;
    }
    try {
      const next = await fileToAttachment(file);
      setError(null);
      setAttachment((prev) => {
        if (prev?.kind === "image") URL.revokeObjectURL(prev.previewUrl);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "फ़ाइल नहीं खुल सकी।");
    }
  }

  // Chip se hatana: tasveer ka preview URL bhi saaf, aur edit mode bhi band.
  function clearAttachment(): void {
    setEditNext(false);
    setAttachment((prev) => {
      if (prev?.kind === "image") URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }

  // Tasveer ya PDF AI ko bhejte hain. Jawab chat mein aata hai: tasveer ya text.
  // Galti par sandesh hatte hain, aur cheez wapas aati hai, taaki user dobara bhej sake.
  async function sendAttachment(opts: {
    label: string;
    prompt: string;
    att: Attachment;
    restoreText: string;
    intent?: ImageIntent;
  }): Promise<void> {
    const { att } = opts;
    // Edit button se chuni tasveer ho to "edit"; warna tasveer ke liye "auto" (server prompt padh kar tay karega).
    const intent: ImageIntent =
      opts.intent ?? (editNext ? "edit" : att.kind === "image" ? "auto" : "ask");
    const typed = opts.prompt.trim();
    const label =
      opts.label.trim().length > 0
        ? opts.label.trim()
        : intent === "edit"
          ? "इस तस्वीर को बेहतर बनाओ"
          : att.kind === "image"
            ? "इस तस्वीर के बारे में बताओ"
            : "इस PDF का सारांश दो";
    const text = typed.length > 0 ? typed : label;
    // Mode ki hint sirf PDF aur edit ke liye; tasveer ke sawal mein seedha wahi sawal jaata hai.
    const prompt = att.kind === "pdf" || intent === "edit" ? `${MODE_HINT[mode]}${text}` : text;

    // Sirf dikhane ke liye: user ko pata rahe ki tasveer ban rahi hai ya jawab likha ja raha hai.
    const IMAGE_WORDS =
      /बनाओ|बना\s*दो|बना\s*दे|बदल|एडिट|edit|बैकग्राउंड|background|हटाओ|हटा\s*दो|remove|सफ़ेद|सफेद|generate|make|इमेज\s*बना|बेहतर|सुधार/i;
    const drawing =
      intent === "edit" || intent === "remove_bg" || (intent === "auto" && IMAGE_WORDS.test(text));
    const status =
      att.kind === "pdf"
        ? "PDF पढ़ी जा रही है…"
        : drawing
          ? "तस्वीर बन रही है… इसमें कुछ सेकंड लग सकते हैं।"
          : "जवाब लिखा जा रहा है…";

    const userKey = crypto.randomUUID();
    const assistantKey = crypto.randomUUID();
    const shown: MessageAttachment =
      att.kind === "image"
        ? { kind: "image", name: att.name, previewUrl: att.previewUrl }
        : { kind: "pdf", name: att.name };

    setInput("");
    setAttachment(null);
    setEditNext(false);
    setError(null);
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { key: userKey, role: "user", content: label, attachment: shown },
      { key: assistantKey, role: "assistant", content: "", pending: true, status },
    ]);

    // Stop dabane par ye controller request ko rokta hai (abortRef se handleStop yahi band karta hai).
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = await authToken();
      if (att.kind === "image") {
        const res = await editImageInChat(token, {
          imageDataUrl: att.dataUrl,
          prompt,
          intent,
          signal: controller.signal,
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.key === assistantKey
              ? {
                  ...m,
                  pending: false,
                  content: res.text ?? "",
                  image: res.download_url ?? undefined,
                }
              : m,
          ),
        );
      } else {
        const res = await askDocument(token, {
          pdfDataUrl: att.dataUrl,
          prompt,
          signal: controller.signal,
        });
        setMessages((prev) =>
          prev.map((m) => (m.key === assistantKey ? { ...m, pending: false, content: res.text } : m)),
        );
      }
    } catch (err) {
      if (isAbort(err)) {
        // User ne roka: sandesh aur cheez dono wapas, taaki wo dobara bhej sake. Error nahi dikhana.
        setMessages((prev) => prev.filter((m) => m.key !== userKey && m.key !== assistantKey));
        setInput(opts.restoreText);
        setAttachment((prev) => prev ?? att);
        return;
      }
      setError(errorText(err));
      setMessages((prev) => prev.filter((m) => m.key !== userKey && m.key !== assistantKey));
      setInput(opts.restoreText);
      setAttachment((prev) => prev ?? att);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSending(false);
    }
  }

  // AI ki bani tasveer ko agle sandesh ke liye chunna: user prompt likhega, AI phir badlega.
  async function pickForEdit(src: string): Promise<void> {
    setError(null);
    try {
      const next = await imageToAttachment(src, "AI-tasveer.jpg");
      setAttachment((prev) => {
        if (prev?.kind === "image") URL.revokeObjectURL(prev.previewUrl);
        return next;
      });
      // Agla sandesh edit hoga.
      setEditNext(true);
      textareaRef.current?.focus();
    } catch {
      setError("यह तस्वीर अभी नहीं खुल पा रही। डाउनलोड करके फिर से चुनें।");
    }
  }

  // Ek tap mein background hatana.
  async function removeBackgroundFrom(src: string): Promise<void> {
    if (sending) return;
    setError(null);
    try {
      const next = await imageToAttachment(src, "AI-tasveer.jpg");
      await sendAttachment({
        label: "बैकग्राउंड हटाओ",
        prompt:
          "इस तस्वीर का बैकग्राउंड हटाओ। मुख्य चीज़ को जैसा है वैसा रखो, और बैकग्राउंड को साफ़ सफ़ेद कर दो।",
        att: next,
        restoreText: "",
        intent: "remove_bg",
      });
    } catch {
      setError("यह तस्वीर अभी नहीं खुल पा रही। डाउनलोड करके फिर से चुनें।");
    }
  }

  function openImage(src: string): void {
    setViewing({ src, alt: "AI की बनाई तस्वीर" });
  }

  // override: dobara banane ke liye (text + wahan tak ke messages). Na ho to input se bhejte hain.
  async function handleSend(override?: { text: string; base: DisplayMessage[] }): Promise<void> {
    // Chuni hui tasveer ya PDF ho to wahi AI ko jaati hai (text ke saath, ya bina text ke).
    if (override === undefined && attachment !== null) {
      if (sending || !ready || guestBlocked) return;
      await sendAttachment({
        label: input,
        prompt: input,
        att: attachment,
        restoreText: input,
      });
      return;
    }

    const text = (override ? override.text : input).trim();
    if (!text || sending || !ready || guestBlocked) return;

    if (text.length > MAX_INPUT_CHARS) {
      setError(`संदेश ${MAX_INPUT_CHARS} अक्षर से ज़्यादा नहीं हो सकता।`);
      return;
    }

    const userKey = crypto.randomUUID();
    const assistantKey = crypto.randomUUID();
    const source: DisplayMessage[] = override ? override.base : messages;
    // Naya sawal bheja to auto retry ginti reset; dobara bhejna (override) mein nahi.
    if (!override) retryCountRef.current = 0;
    lastSendRef.current = { text, base: source };

    // Pichhli baatein bhejni hain? Guest ke liye hamesha (server yaad nahi rakhta).
    // Login user ke liye sirf tab jab history band ho (warna server DB se leta hai).
    const sendHistory = isGuest || (isMember && profile !== null && !profile.history_enabled);
    const priorTurns: ChatTurn[] = source
      .filter((m) => !m.pending && m.content.length > 0)
      .slice(-HISTORY_LIMIT)
      .map((m) => ({ role: m.role, content: m.content }));

    const controller = new AbortController();
    abortRef.current = controller;
    if (!override) setInput("");
    setError(null);
    setSending(true);
    setMessages((prev) => [
      ...(override ? override.base : prev),
      { key: userKey, role: "user", content: text },
      { key: assistantKey, role: "assistant", content: "", pending: true },
    ]);

    // Guest ka count server ki tarah request aate hi badhta hai.
    if (isGuest) {
      const next = guestUsed + 1;
      setGuestUsed(next);
      writeGuestCount(next);
    }

    let newId: string | null = null;

    try {
      const token = isGuest ? null : await authToken();
      const result = await streamChat(
        token,
        {
          message: text,
          conversationId: isGuest ? null : activeId,
          history: sendHistory ? priorTurns : undefined,
          idempotencyKey: crypto.randomUUID(),
          mode,
        },
        {
          onDelta: (chunk) => {
            setMessages((prev) =>
              prev.map((m) => (m.key === assistantKey ? { ...m, content: m.content + chunk } : m)),
            );
          },
          onDone: () => undefined,
        },
        controller.signal,
      );

      newId = result.conversationId;
      setMessages((prev) =>
        prev.map((m) => (m.key === assistantKey ? { ...m, pending: false } : m)),
      );
    } catch (err) {
      if (isAbort(err)) {
        // User ne roka: jitna jawab aaya woh rakhte hain, saath mein note.
        setMessages((prev) =>
          prev.map((m) =>
            m.key === assistantKey ? { ...m, pending: false, stopped: true } : m,
          ),
        );
      } else if (isGuest && isLoginRequired(err)) {
        // Server ne guest ki limit rok di: counter bhi limit par, card dikhega, bubbles hatao.
        setGuestUsed(GUEST_MESSAGES_PER_DAY);
        writeGuestCount(GUEST_MESSAGES_PER_DAY);
        setMessages((prev) => prev.filter((m) => m.key !== userKey && m.key !== assistantKey));
      } else {
        // Error: khaali jawab hata do, sawal input mein wapas, taaki dobara bhej sake.
        // Dobara banane mein input ko nahi chhedte, user ka likha draft bachta hai.
        // Net nahi: sawal outbox mein surakshit, bubble dikhta rahe; jud te hi apne-aap jaayega.
        const queued = isMember && isNetworkError(err);
        if (queued) {
          enqueue({ text, conversationId: activeId, mode });
        } else if (!override) {
          setInput(text);
        }
        setErrorInfo(friendlyFromApi(err));
        setErrorRaw(null);
        setMessages((prev) =>
          prev.flatMap((m) => {
            if (m.key === userKey) return queued ? [m] : [];
            if (m.key !== assistantKey) return [m];
            if (m.content.length === 0) return [];
            return [{ ...m, pending: false }];
          }),
        );
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSending(false);
    }
    // Login user ka naya chat: list mein sabse upar, URL mein id. Messages pehle se screen par hain.
    if (isMember && newId !== null) {
      const id: string = newId;
      const now = new Date().toISOString();
      if (activeId === null) {
        loadedIdRef.current = id;
        setConversations((prev) => [
          { id, title: titleFrom(text), created_at: now, updated_at: now },
          ...prev,
        ]);
        navigate(`/chat/${id}`, { replace: true });
      } else {
        setConversations((prev) => {
          const found = prev.find((c) => c.id === id);
          if (!found) return prev;
          return [{ ...found, updated_at: now }, ...prev.filter((c) => c.id !== id)];
        });
      }
    }
  }

  async function handleLoadMore(): Promise<void> {
    if (!nextCursor) return;
    try {
      const token = await authToken();
      const res = await listConversations(token, {
        limit: CONVERSATION_PAGE,
        before: nextCursor,
      });
      setConversations((prev) => [...prev, ...res.conversations]);
      setNextCursor(res.next_cursor);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function handleDelete(id: string): Promise<void> {
    if (sending) return;
    if (!window.confirm("यह बातचीत हमेशा के लिए हट जाएगी। क्या आप सहमत हैं?")) return;

    try {
      const token = await authToken();
      await deleteConversation(token, id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        navigate("/chat", { replace: true });
      }
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function handleSignOut(): Promise<void> {
    abortRef.current?.abort();
    try {
      await signOut();
      navigate("/chat", { replace: true });
    } catch (err) {
      setError(errorText(err));
    }
  }

  // User ka sawal composer mein bhar deta hai, user badal kar bhejta hai. Purani baatein nahi chhedte.
  function handleEditQuestion(text: string): void {
    if (sending) return;
    setInput(text);
    textareaRef.current?.focus();
  }

  // Aakhri sawal ko dobara bhejte hain: uska purana jawab hata kar naya banta hai.
  function handleRegenerate(): void {
    if (!canRegenerate) return;
    const idx = messages.map((m) => m.role).lastIndexOf("user");
    const question = idx >= 0 ? messages[idx] : undefined;
    if (question === undefined) return;
    void handleSend({ text: question.content, base: messages.slice(0, idx) });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void handleSend();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    // Enter bhejta hai, Shift+Enter nayi line. IME (Hindi keyboard) composition ke beech nahi bhejta.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void handleSend();
    }
  }

  const lastAssistantKey: string | null =
    [...messages].reverse().find((m) => m.role === "assistant")?.key ?? null;

  // Profile fail ho to "लोड हो रहा है…" par atkaayen nahi, saaf batayen.
  const profileFailed = isMember && profile === null && error !== null;
  const placeholder = profileFailed
    ? "प्रोफ़ाइल नहीं खुली। ऊपर का संदेश देखें।"
    : !ready
      ? "लोड हो रहा है…"
      : guestBlocked
        ? "आज के मुफ़्त संदेश खत्म हो गए"
        : "अपना सवाल लिखें…";

  return (
    <div className="chat-layout">
      <ChatSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isGuest={isGuest}
        isMember={isMember}
        email={isMember ? (user?.email ?? null) : null}
        planName={plan?.name ?? null}
        historyState={profile === null ? "loading" : profile.history_enabled ? "on" : "off"}
        conversations={conversations}
        activeId={activeId}
        hasMore={nextCursor !== null}
        busy={sending}
        newChatDisabled={status === "loading"}
        currentLang={currentLang}
        onLanguage={(code) => void handleLanguage(code)}
        onNewChat={handleNewChat}
        onOpen={openConversation}
        onDelete={(id) => void handleDelete(id)}
        onLoadMore={() => void handleLoadMore()}
        onSignOut={() => void handleSignOut()}
      />

      <main className="chat-main">
        <HomeTopBar onOpenMenu={() => setSidebarOpen(true)} />

        <section className="chat-messages" aria-live="polite">
          {loadingMessages && <p className="muted">बातचीत लोड हो रही है…</p>}
          {!loadingMessages && convoEmpty && messages.length === 0 && (
            <p className="muted small" role="status">
              इस बातचीत में अभी कोई संदेश सेव नहीं है। नीचे लिखकर बात जारी रखें।
            </p>
          )}

          {!loadingMessages && messages.length === 0 && (
            prefs.role === "partner" ? (
              <PartnerHome
                onAction={handlePartnerAction}
                onExit={() => setPrefs({ ...prefs, role: "user" })}
              />
            ) : (
              <HomeToolPanel
                active={homeCategory}
                onChangeCategory={handleChangeCategory}
                onPickTool={handlePickTool}
              />
            )
          )}

          {messages.map((m) => (
            <article key={m.key} className={`bubble ${m.role}`}>
              {m.attachment !== undefined && <UserAttachment attachment={m.attachment} />}
              {m.image !== undefined && (
                <AiImageBlock
                  src={m.image}
                  disabled={sending}
                  onOpen={openImage}
                  onEdit={(src) => void pickForEdit(src)}
                  onRemoveBackground={(src) => void removeBackgroundFrom(src)}
                />
              )}
              {m.pending && m.status !== undefined ? (
                <div className="gen-status" role="status">
                  <span className="gen-bar" aria-hidden="true" />
                  <span>{m.status}</span>
                </div>
              ) : (
                <div className={m.role === "assistant" ? "bubble-text bubble-md" : "bubble-text"}>
                  {m.role === "assistant" ? <Markdown text={m.content} /> : m.content}
                  {m.pending && (
                    <span className="cursor" aria-hidden="true">
                      ▍
                    </span>
                  )}
                </div>
              )}
              {m.role === "user" && !m.pending && (
                <div className="msg-actions" role="group" aria-label="सवाल के विकल्प">
                  <button
                    type="button"
                    className="msg-action"
                    onClick={() => handleEditQuestion(m.content)}
                    disabled={sending}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                    <span>बदलें</span>
                  </button>
                </div>
              )}
              {m.stopped && <p className="muted small">जवाब बीच में रोका गया।</p>}
              {m.role === "assistant" && !m.pending && m.content.length > 0 && (
                <MessageActions
                  text={m.content}
                  onRegenerate={
                    canRegenerate && m.key === lastAssistantKey ? handleRegenerate : undefined
                  }
                />
              )}
            </article>
          ))}
          <div ref={endRef} />
        </section>

        {guestBlocked && (
          <section
            className="card"
            role="region"
            aria-label="लॉग-इन करें"
            style={{ margin: "0 16px 8px" }}
          >
            <h2>आज के मुफ़्त संदेश खत्म हो गए</h2>
            <p className="muted small">
              आगे बात जारी रखने और अपनी बातचीत सेव करने के लिए लॉग-इन करें। कल फिर मुफ़्त संदेश मिलेंगे।
            </p>
            <Link
              to="/login"
              className="btn-primary"
              style={{ textDecoration: "none", alignSelf: "flex-start" }}
            >
              लॉग-इन करें
            </Link>
          </section>
        )}

        {errorInfo !== null && (
          <ErrorPanel
            info={errorInfo}
            onRetry={errorInfo.canRetry ? handleRetry : undefined}
            onLogin={() => navigate("/login")}
            onTypeInstead={() => textareaRef.current?.focus()}
            onDismiss={() => setError(null)}
          />
        )}
        {errorInfo === null && error !== null && (
          <div className="chat-error chat-error-row" role="alert" style={{ margin: "0 16px 8px" }}>
            <div className="chat-error-body">
              <p style={{ margin: 0 }}>{error}</p>
              {profileFailed && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={handleRetryProfile}
                  style={{ marginTop: 8 }}
                >
                  फिर से कोशिश करें
                </button>
              )}
            </div>
            <button
              type="button"
              className="chat-error-close"
              onClick={() => setError(null)}
              aria-label="संदेश बंद करें"
            >
              ✕
            </button>
          </div>
        )}

        <form className="composer-form" onSubmit={handleSubmit}>
          <div className="composer-box">
            {attachment !== null && (
              <ComposerChip attachment={attachment} onClear={clearAttachment} />
            )}
            <div className="composer-row">
              <ComposerPlus
                modeLabel={findMode(mode).label}
                disabled={sending || !ready || guestBlocked}
                isGuest={isGuest}
                onFile={(file) => void handleFile(file)}
              />
              <textarea
                ref={textareaRef}
                className="composer-input"
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                maxLength={MAX_INPUT_CHARS}
                disabled={!ready || guestBlocked}
                aria-label="संदेश"
              />

              {isMember && (
                <span className="composer-mic">
                  <PushToTalkButton
                    getToken={() => getAccessToken()}
                    onTranscript={handleTranscript}
                    onError={handleMicError}
                    disabled={!ready || sending}
                  />
                </span>
              )}

              {sending ? (
                <button
                  type="button"
                  className="composer-action"
                  onClick={handleStop}
                  aria-label="रोकें"
                  title="रोकें"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" />
                  </svg>
                </button>
              ) : (
                <button
                  type="submit"
                  className="composer-action"
                  disabled={!canSend}
                  aria-label="भेजें"
                  title="भेजें"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </form>
      </main>

      {viewing !== null && (
        <ImageViewer src={viewing.src} alt={viewing.alt} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}