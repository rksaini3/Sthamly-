// Sthamly AI web: chat screen (Blueprint 3.0, section 6, 10, guest mode)
// Guest (login nahi): chat khuli hai, din ke limited messages, chat server par save nahi.
// Guest ki history client par rehti hai aur har request ke saath jaati hai.
// Login user: history DB mein, conversation list, usage, mic (push-to-talk).
// Guest limit khatam: login card dikhta hai aur chat band. Asli limit Worker (guest.ts) lagata hai.
// Login hone par guest ki chat nahi jaati: naya, khaali chat shuru hota hai.
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
  type ChatTurn,
  type ConversationSummary,
  type ProfileResponse,
  type ProfileView,
  type StoredMessage,
} from "../api/client";
import { PushToTalkButton } from "../voice/PushToTalkButton";

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
}

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
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [guestUsed, setGuestUsed] = useState<number>(() => readGuestCount());

  // Chal rahi request ka controller. Stop, chat badalne aur screen band hone par abort hota hai.
  const abortRef = useRef<AbortController | null>(null);
  // Kaunsi conversation ke messages abhi loaded hain. Naya chat bante hi reload se bachne ke liye.
  const loadedIdRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const guestLeft = Math.max(0, GUEST_MESSAGES_PER_DAY - guestUsed);
  const guestBlocked = isGuest && guestLeft === 0;
  // Guest hamesha tayyar. Login user ke liye profile load hona zaroori hai.
  const ready = isGuest || (isMember && profile !== null);
  const canSend = ready && !guestBlocked && input.trim().length > 0 && !sending;

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
  }, [isMember, user?.id]);

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

  // Mic se mila text input mein jaata hai, user dekh kar bheje.
  function handleTranscript(text: string): void {
    setInput((prev) => (prev.trim().length > 0 ? `${prev.trim()} ${text}` : text));
  }

  async function handleSend(): Promise<void> {
    const text = input.trim();
    if (!text || sending || !ready || guestBlocked) return;

    if (text.length > MAX_INPUT_CHARS) {
      setError(`संदेश ${MAX_INPUT_CHARS} अक्षर से ज़्यादा नहीं हो सकता।`);
      return;
    }

    const userKey = crypto.randomUUID();
    const assistantKey = crypto.randomUUID();

    // Pichhli baatein bhejni hain? Guest ke liye hamesha (server yaad nahi rakhta).
    // Login user ke liye sirf tab jab history band ho (warna server DB se leta hai).
    const sendHistory = isGuest || (isMember && profile !== null && !profile.history_enabled);
    const priorTurns: ChatTurn[] = messages
      .filter((m) => !m.pending && m.content.length > 0)
      .slice(-HISTORY_LIMIT)
      .map((m) => ({ role: m.role, content: m.content }));

    const controller = new AbortController();
    abortRef.current = controller;
    setInput("");
    setError(null);
    setSending(true);
    setMessages((prev) => [
      ...prev,
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
        setError(errorText(err));
        setInput(text);
        setMessages((prev) =>
          prev.flatMap((m) => {
            if (m.key === userKey) return [];
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

  const placeholder = !ready
    ? "लोड हो रहा है…"
    : guestBlocked
      ? "आज के मुफ़्त संदेश खत्म हो गए"
      : "अपना सवाल लिखें…";

  return (
    <div className="chat-layout">
      <aside className={`chat-sidebar${sidebarOpen ? " open" : ""}`} aria-label="बातचीत की सूची">
        <div className="sidebar-top">
          <button
            type="button"
            className="btn-primary"
            onClick={handleNewChat}
            disabled={status === "loading"}
          >
            + नई बातचीत
          </button>
          <button
            type="button"
            className="btn-ghost sidebar-close"
            onClick={() => setSidebarOpen(false)}
          >
            बंद करें
          </button>
        </div>

        {isMember &&
          (profile === null ? (
            <p className="muted">लोड हो रहा है…</p>
          ) : profile.history_enabled ? (
            <>
              <ul className="conv-list">
                {conversations.map((c) => (
                  <li key={c.id} className={c.id === activeId ? "conv-item active" : "conv-item"}>
                    <button
                      type="button"
                      className="conv-open"
                      onClick={() => openConversation(c.id)}
                      disabled={sending}
                    >
                      {c.title}
                    </button>
                    <button
                      type="button"
                      className="conv-delete"
                      aria-label="बातचीत हटाएँ"
                      onClick={() => void handleDelete(c.id)}
                      disabled={sending}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              {nextCursor !== null && (
                <button type="button" className="btn-ghost" onClick={() => void handleLoadMore()}>
                  और देखें
                </button>
              )}
            </>
          ) : (
            <p className="muted">इतिहास बंद है। सेटिंग्स में चालू करें।</p>
          ))}

        {isGuest && (
          <p className="muted small">
            मेहमान मोड में बातचीत सेव नहीं होती। लॉग-इन करने पर इतिहास मिलेगा।
          </p>
        )}

        <nav className="sidebar-nav">
          {isMember ? (
            <>
              <Link to="/usage">उपयोग</Link>
              <Link to="/settings">सेटिंग्स</Link>
              <button type="button" className="btn-ghost" onClick={() => void handleSignOut()}>
                लॉग-आउट
              </button>
            </>
          ) : (
            <Link to="/login">लॉग-इन करें</Link>
          )}
        </nav>
        {isMember && user?.email && <p className="muted small sidebar-user">{user.email}</p>}
      </aside>

      <main className="chat-main">
        <header className="chat-header">
          <button
            type="button"
            className="btn-ghost menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="मेन्यू खोलें"
          >
            ☰
          </button>
          <h1 className="chat-title">Sthamly AI</h1>
          {isGuest && !guestBlocked && (
            <span className="muted small">आज बचे: {guestLeft}</span>
          )}
          {isMember && plan !== null && <span className="plan-badge">{plan.name}</span>}
          {isGuest && <span className="plan-badge">मेहमान</span>}
        </header>

        <section className="chat-messages" aria-live="polite">
          {loadingMessages && <p className="muted">बातचीत लोड हो रही है…</p>}

          {!loadingMessages && messages.length === 0 && (
            <div className="empty-state">
              <h2>नमस्ते!</h2>
              <p>अपना सवाल हिंदी या Hinglish में लिखें।</p>
              {isGuest && (
                <p className="small">मेहमान के रूप में आज {GUEST_MESSAGES_PER_DAY} संदेश मुफ़्त हैं।</p>
              )}
            </div>
          )}

          {messages.map((m) => (
            <article key={m.key} className={`bubble ${m.role}`}>
              <div className="bubble-text">
                {m.content}
                {m.pending && (
                  <span className="cursor" aria-hidden="true">
                    ▍
                  </span>
                )}
              </div>
              {m.stopped && <p className="muted small">जवाब बीच में रोका गया।</p>}
            </article>
          ))}
          <div ref={endRef} />
        </section>

        {guestBlocked && (
          <section className="card" role="region" aria-label="लॉग-इन करें" style={{ margin: "0 16px 8px" }}>
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

        {error !== null && (
          <p className="chat-error" role="alert">
            {error}
          </p>
        )}

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
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
            <PushToTalkButton
              getToken={() => getAccessToken()}
              onTranscript={handleTranscript}
              onError={(message: string) => setError(message)}
              disabled={!ready || sending}
            />
          )}

          {sending ? (
            <button type="button" className="btn-stop" onClick={handleStop}>
              रोकें
            </button>
          ) : (
            <button type="submit" className="btn-primary" disabled={!canSend}>
              भेजें
            </button>
          )}
        </form>
      </main>
    </div>
  );
}