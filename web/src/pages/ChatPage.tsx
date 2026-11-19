// Sthamly AI web: chat screen (Blueprint 3.0, section 6, 10)
// Streaming reply, Stop, conversation list (cursor se aur), naya chat, delete.
// History band ho to conversation DB mein nahi banti, client ki history har request mein jaati hai.
// Route /chat/:conversationId se conversation khulti hai. Naya chat pehle reply ke baad URL mein aata hai.
// Raw server ya provider error nahi dikhta, sirf Hindi message.

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  ApiClientError,
  deleteConversation,
  getProfile,
  listConversations,
  listMessages,
  streamChat,
  type ChatTurn,
  type ConversationSummary,
  type ProfileResponse,
  type ProfileView,
  type StoredMessage,
} from "../api/client";

const CONVERSATION_PAGE = 30;
const HISTORY_LIMIT = 20;
const MAX_INPUT_CHARS = 4000;
const TITLE_CHARS = 40;

interface DisplayMessage {
  key: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  stopped?: boolean;
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

export function ChatPage() {
  const { getAccessToken, user, signOut } = useAuth();
  const navigate = useNavigate();
  const { conversationId: routeId } = useParams<{ conversationId: string }>();
  const activeId: string | null = routeId ?? null;

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

  // Chal rahi request ka controller. Stop, chat badalne aur screen band hone par yahin se abort hota hai.
  const abortRef = useRef<AbortController | null>(null);
  // Kaunsi conversation ke messages abhi loaded hain. Naya chat bante hi reload se bachne ke liye.
  const loadedIdRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  async function requireToken(): Promise<string> {
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

  // Profile aur conversation list. History band ho to list nahi mangte.
  useEffect(() => {
    const ctrl = new AbortController();

    (async () => {
      try {
        const token = await requireToken();
        const res = await getProfile(token, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setProfile(res.profile);
        setPlan(res.plan);

        if (res.profile.history_enabled) {
          const list = await listConversations(token, { limit: CONVERSATION_PAGE }, ctrl.signal);
          if (ctrl.signal.aborted) return;
          setConversations(list.conversations);
          setNextCursor(list.next_cursor);
        }
      } catch (err) {
        if (isAbort(err)) return;
        setError(errorText(err));
      }
    })();

    return () => ctrl.abort();
    // requireToken getAccessToken par tika hai, woh stable hai
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAccessToken]);

  // Route badalne par messages load karna.
  useEffect(() => {
    // Chalti request (agar hai) pichle route ki hai, use band karo.
    abortRef.current?.abort();

    if (!profile) return;

    if (activeId === null) {
      loadedIdRef.current = null;
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

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
        const token = await requireToken();
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
    // requireToken getAccessToken par tika hai, woh stable hai
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, profile, navigate]);

  // Naye message par neeche scroll.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function handleStop(): void {
    abortRef.current?.abort();
  }

  function handleNewChat(): void {
    abortRef.current?.abort();
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

  async function handleSend(): Promise<void> {
    const text = input.trim();
    if (!text || sending || !profile) return;

    if (text.length > MAX_INPUT_CHARS) {
      setError(`संदेश ${MAX_INPUT_CHARS} अक्षर से ज़्यादा नहीं हो सकता।`);
      return;
    }

    const userKey = crypto.randomUUID();
    const assistantKey = crypto.randomUUID();

    // History band ho to client ki history bheji jaati hai. Chalu ho to server DB se laata hai.
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

    let newId: string | null = null;

    try {
      const token = await requireToken();
      const result = await streamChat(
        token,
        {
          message: text,
          conversationId: activeId,
          history: profile.history_enabled ? undefined : priorTurns,
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
      } else {
        // Error: khaali jawab hata do, user ka sawal rakho aur input wapas bharo, taaki dobara bhej sake.
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

    if (newId !== null && activeId === null) {
      // Naya chat ban gaya: list mein sabse upar, URL mein id. Messages pehle se screen par hain.
      const now = new Date().toISOString();
      loadedIdRef.current = newId;
      setConversations((prev) => [
        { id: newId as string, title: titleFrom(text), created_at: now, updated_at: now },
        ...prev,
      ]);
      navigate(`/chat/${newId}`, { replace: true });
    } else if (newId !== null && activeId !== null) {
      const now = new Date().toISOString();
      setConversations((prev) => {
        const found = prev.find((c) => c.id === activeId);
        if (!found) return prev;
        return [{ ...found, updated_at: now }, ...prev.filter((c) => c.id !== activeId)];
      });
    }
  }

  async function handleLoadMore(): Promise<void> {
    if (!nextCursor) return;
    try {
      const token = await requireToken();
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
      const token = await requireToken();
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

  const canSend = profile !== null && input.trim().length > 0 && !sending;

  return (
    <div className="chat-layout">
      <aside className={`chat-sidebar${sidebarOpen ? " open" : ""}`} aria-label="बातचीत की सूची">
        <div className="sidebar-top">
          <button
            type="button"
            className="btn-primary"
            onClick={handleNewChat}
            disabled={profile === null}
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

        {profile === null ? (
          <p className="muted">लोड हो रहा है…</p>
        ) : !profile.history_enabled ? (
          <p className="muted">इतिहास बंद है। सेटिंग्स में चालू करें।</p>
        ) : (
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
        )}

        <nav className="sidebar-nav">
          <Link to="/usage">उपयोग</Link>
          <Link to="/settings">सेटिंग्स</Link>
          <button type="button" className="btn-ghost" onClick={() => void handleSignOut()}>
            लॉग-आउट
          </button>
        </nav>
        {user?.email && <p className="muted small sidebar-user">{user.email}</p>}
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
          {plan !== null && <span className="plan-badge">{plan.name}</span>}
        </header>

        <section className="chat-messages" aria-live="polite">
          {loadingMessages && <p className="muted">बातचीत लोड हो रही है…</p>}

          {!loadingMessages && messages.length === 0 && (
            <div className="empty-state">
              <h2>नमस्ते!</h2>
              <p>अपना सवाल हिंदी या Hinglish में लिखें।</p>
            </div>
          )}

          {messages.map((m) => (
            <article key={m.key} className={`bubble ${m.role}`}>
              <div className="bubble-text">
                {m.content}
                {m.pending && <span className="cursor" aria-hidden="true">▍</span>}
              </div>
              {m.stopped && <p className="muted small">जवाब बीच में रोका गया।</p>}
            </article>
          ))}
          <div ref={endRef} />
        </section>

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
            placeholder="अपना सवाल लिखें…"
            maxLength={MAX_INPUT_CHARS}
            disabled={profile === null}
            aria-label="संदेश"
          />
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