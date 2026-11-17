import { useEffect, useRef, useState, type CSSProperties } from "react";
import { authedFetch, ApiError } from "../api";
import { IS_NATIVE, type Store } from "../db";
import { formatRupees } from "../ledger/money";
import { listParties } from "../ledger/repo";
import { createApproval, decideApproval, pendingApprovals, type LedgerPayload } from "./approvals";
import { parseIntent, sameName } from "./rules";

// ---- Types ----

type ServerState = "idle" | "busy" | "done" | "rejected" | "failed" | "expired";

interface Msg {
  id: number;
  role: "user" | "bot";
  text: string;
  // Android के अपने हिसाब (udhaar, paisa) की मंज़ूरी
  ledger?: { approvalId: number; open: boolean };
  // Server (LLM agent) के काम की मंज़ूरी (पोस्टर आदि)
  server?: { actionId: string; expiresAt: string; state: ServerState };
}

interface AgentAction {
  id: string;
  tool: string;
  summary: string;
  expiresAt: string;
}

// /api/voice/chat का जवाब (web वाली चैट वही route इस्तेमाल करती है)
interface ChatResponse {
  reply: string;
  threadId: string | null;
  status: "done" | "waiting_confirm" | "chat";
  actions: AgentAction[];
}

// /api/chats की सूची
interface ChatListResponse {
  chats?: { id: string }[];
}

// /api/chats/[id]: संदेश और अभी की pending मंज़ूरियां
interface ChatDetailResponse {
  messages?: { role: "user" | "assistant"; content: string; createdAt: string }[];
  pendingActions?: AgentAction[];
}

// server को भेजी जाने वाली बातचीत की सीमा (route में max 12 संदेश, हर 1000 अक्षर तक)
const MAX_HISTORY_MESSAGES = 11;
const MAX_MESSAGE_CHARS = 1000;

const HELP = [
  "ये काम कर सकता हूँ:",
  "• udhaar Ramesh 500 chini (हिसाब में उधार)",
  "• paisa mila Ramesh 200 (भुगतान दर्ज)",
  "• balance Ramesh (बाकी रकम)",
  "• poster Diwali sale 20% off (इंटरनेट से, पोस्टर)",
  "• कोई भी सवाल, जैसे आज का बाज़ार कैसा है",
  "हिसाब वाले काम इंटरनेट के बिना भी चलते हैं। बाकी के लिए इंटरनेट चाहिए।",
  "पैसे या पोस्टर वाले काम पहले आपकी मंज़ूरी माँगेंगे।",
].join("\n");

function balanceText(paise: number): string {
  if (paise === 0) return "हिसाब बराबर है";
  return paise > 0 ? `लेना है ${formatRupees(paise)}` : `देना है ${formatRupees(-paise)}`;
}

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

// server के error code के हिसाब से सादा संदेश
function serverErrorText(status: number): string {
  if (status === 401) return "पहले लॉग-इन करें";
  if (status === 402) return "आज की मुफ़्त बातचीत पूरी हो गई। जारी रखने के लिए वॉलेट भरें।";
  if (status === 429) return "बहुत जल्दी-जल्दी भेजा जा रहा है, थोड़ा रुकें";
  return "एजेंट में गड़बड़ हुई, थोड़ी देर बाद दोबारा कोशिश करें";
}

export function AgentScreen({ store }: { store: Store | null }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // पुरानी बातचीत खुल रही हो तो नया संदेश न जाए (वरना threadId टकरा जाएगी)
  const [historyLoading, setHistoryLoading] = useState(true);
  const nextId = useRef(1);
  const loaded = useRef(false);
  const historyStarted = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  // बातचीत की id: पहले संदेश पर server बनाता है, या पुरानी बातचीत खुलने पर वही लेते हैं
  const threadId = useRef<string | null>(null);

  function push(msg: Omit<Msg, "id">) {
    const id = nextId.current++;
    setMessages((prev) => [...prev, { ...msg, id }]);
  }

  // App खुलने पर: सबसे नई बातचीत के संदेश और उसकी pending मंज़ूरियां वापस दिखें
  useEffect(() => {
    if (historyStarted.current) return;
    historyStarted.current = true;
    void loadLatestThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // App खुलने पर: पहले से खुली हिसाब की मंज़ूरियां card के रूप में वापस दिखें
  // (poster वाली पुरानी मंज़ूरियां अब server से होती हैं, इसलिए उन्हें नहीं दिखाते)
  useEffect(() => {
    if (!store || loaded.current) return;
    loaded.current = true;
    pendingApprovals(store)
      .then((list) => {
        for (const a of list) {
          if (a.kind !== "ledger_entry") continue;
          push({ role: "bot", text: a.summary, ledger: { approvalId: a.id, open: true } });
        }
      })
      .catch(() => undefined);
  }, [store]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  // ---- पुरानी बातचीत ----

  async function loadLatestThread() {
    try {
      const listRes = await authedFetch("/api/chats");
      if (!listRes.ok) return;
      const list = (await listRes.json().catch(() => null)) as ChatListResponse | null;
      const latest = list?.chats?.[0];
      if (!latest) return;

      const detailRes = await authedFetch(`/api/chats/${latest.id}`);
      if (!detailRes.ok) return;
      const detail = (await detailRes.json().catch(() => null)) as ChatDetailResponse | null;
      if (!detail?.messages) return;

      threadId.current = latest.id;

      // पहले पुराने संदेश, फिर उस बातचीत की pending मंज़ूरियां (जिन पर "मंज़ूरी दें" दबाना है)
      const rows: Msg[] = detail.messages.map((m) => ({
        id: nextId.current++,
        role: m.role === "user" ? "user" : "bot",
        text: m.content,
      }));
      const approvals: Msg[] = (detail.pendingActions ?? []).map((a) => ({
        id: nextId.current++,
        role: "bot",
        text: a.summary,
        server: { actionId: a.id, expiresAt: a.expiresAt, state: "idle" },
      }));

      setMessages((prev) => [...rows, ...approvals, ...prev]);
    } catch {
      // इतिहास न खुले तो नई बातचीत से चलेगा
    } finally {
      setHistoryLoading(false);
    }
  }

  // नई बातचीत: text वाले संदेश हटेंगे, पर खुले हिसाब और pending server cards रहेंगे
  // (वो DB में अभी भी मंज़ूरी के इंतज़ार में हैं)
  function startNewChat() {
    if (busy || historyLoading) return;
    threadId.current = null;
    setMessages((prev) =>
      prev.filter((m) => m.ledger?.open || (m.server && m.server.state === "idle")),
    );
  }

  // server को भेजने के लिए: सिर्फ़ text वाले संदेश, पुराने से नए क्रम में
  function historyFor(prior: Msg[]) {
    return prior
      .filter((m) => m.text.trim().length > 0)
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: clip(m.text, MAX_MESSAGE_CHARS),
      }));
  }

  // ---- Server (LLM agent) से बात ----

  async function askServer(text: string, prior: Msg[]) {
    const messagesToSend = [
      ...historyFor(prior),
      { role: "user" as const, content: clip(text, MAX_MESSAGE_CHARS) },
    ];

    let res: Response;
    try {
      res = await authedFetch("/api/voice/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(threadId.current ? { threadId: threadId.current } : {}),
          messages: messagesToSend,
        }),
      });
    } catch (error) {
      if (error instanceof ApiError) {
        push({ role: "bot", text: error.message });
      } else {
        push({
          role: "bot",
          text: "इंटरनेट नहीं है या सर्वर तक नहीं पहुंच पाए। हिसाब वाले काम (udhaar, paisa, balance) अभी भी चलेंगे।",
        });
      }
      return;
    }

    const data = (await res.json().catch(() => null)) as
      | ChatResponse
      | { error?: { message?: string } }
      | null;

    if (!res.ok || !data || !("reply" in data)) {
      const message =
        data && "error" in data && data.error?.message ? data.error.message : serverErrorText(res.status);
      push({ role: "bot", text: message });
      return;
    }

    // पहली बार बनी बातचीत की id यहीं रखें, ताकि अगले संदेश उसी में जाएं
    if (data.threadId) threadId.current = data.threadId;

    push({ role: "bot", text: data.reply });

    // मंज़ूरी वाले काम: हर काम का अपना card
    for (const action of data.actions ?? []) {
      push({
        role: "bot",
        text: action.summary,
        server: { actionId: action.id, expiresAt: action.expiresAt, state: "idle" },
      });
    }
  }

  async function decideServer(msgId: number, actionId: string, decision: "approve" | "reject") {
    setServerState(msgId, "busy");

    let res: Response;
    try {
      res = await authedFetch("/api/agent/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, decision }),
      });
    } catch {
      // नेटवर्क की गड़बड़ी: card फिर से खुले ताकि दोबारा दबा सकें
      setServerState(msgId, "idle");
      push({ role: "bot", text: "नेटवर्क की गड़बड़ी, दोबारा कोशिश करें" });
      return;
    }

    const data = (await res.json().catch(() => null)) as
      | { status?: string; reply?: string; error?: { message?: string } }
      | null;

    if (res.status === 409) {
      setServerState(msgId, "done");
      push({ role: "bot", text: "इस काम पर पहले ही फ़ैसला हो चुका है" });
      return;
    }
    if (res.status === 410) {
      setServerState(msgId, "expired");
      push({ role: "bot", text: data?.error?.message ?? "मंज़ूरी का समय निकल गया, काम दोबारा माँगें" });
      return;
    }
    if (!res.ok) {
      setServerState(msgId, "failed");
      push({ role: "bot", text: data?.error?.message ?? serverErrorText(res.status) });
      return;
    }

    if (decision === "reject") {
      setServerState(msgId, "rejected");
    } else {
      setServerState(msgId, data?.status === "done" ? "done" : "failed");
    }
    push({ role: "bot", text: data?.reply ?? (decision === "reject" ? "काम रद्द कर दिया गया।" : "") });
  }

  function setServerState(msgId: number, state: ServerState) {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId && m.server ? { ...m, server: { ...m.server, state } } : m)),
    );
  }

  // ---- Android के अपने हिसाब (ऑफ़लाइन भी) ----

  async function decideLedger(msgId: number, approvalId: number, decision: "approve" | "reject") {
    if (!store || busy) return;
    setBusy(true);
    // card तुरंत बंद, ताकि दोबारा न दबे
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId && m.ledger ? { ...m, ledger: { ...m.ledger, open: false } } : m)),
    );
    try {
      const res = await decideApproval(store, approvalId, decision);
      push({ role: "bot", text: res.message });
    } catch (error) {
      push({ role: "bot", text: `कुछ गड़बड़ हुई: ${String(error)}` });
    } finally {
      setBusy(false);
    }
  }

  // ---- मुख्य: संदेश कहां जाए ----

  async function send() {
    const text = input.trim();
    if (!store || busy || historyLoading || text.length < 2) return;
    setInput("");
    const prior = messages;
    push({ role: "user", text });
    setBusy(true);
    try {
      const intent = parseIntent(text);

      // पोस्टर और बाकी सब सवाल: server का LLM agent
      if (intent.type === "unknown" || intent.type === "poster") {
        await askServer(text, prior);
        return;
      }

      // हिसाब वाले काम: ऑफ़लाइन, server नहीं
      const parties = await listParties(store);
      const name = intent.name;
      const party = parties.find((p) => sameName(p.name, name));
      if (!party) {
        push({ role: "bot", text: `"${name}" नाम का ग्राहक नहीं मिला। पहले "हिसाब" tab में जोड़ें।` });
        return;
      }

      if (intent.type === "balance") {
        push({ role: "bot", text: `${party.name}: ${balanceText(party.balancePaise)}` });
        return;
      }

      // उधार या भुगतान: paisa से जुड़ा है, इसलिए मंज़ूरी का card आएगा
      const isSale = intent.type === "sale";
      const payload: LedgerPayload = {
        partyId: party.id,
        partyName: party.name,
        kind: isSale ? "sale" : "payment",
        amountPaise: intent.amountPaise,
        note: isSale ? intent.note : null,
      };
      const summary = isSale
        ? `${party.name} को ${formatRupees(intent.amountPaise)} उधार दर्ज होगा`
        : `${party.name} से ${formatRupees(intent.amountPaise)} मिले, दर्ज होगा`;
      const id = await createApproval(store, "ledger_entry", summary, payload);
      push({ role: "bot", text: summary, ledger: { approvalId: id, open: true } });
    } catch (error) {
      push({ role: "bot", text: `कुछ गड़बड़ हुई: ${String(error)}` });
    } finally {
      setBusy(false);
    }
  }

  if (!IS_NATIVE) {
    return <p style={{ color: "#57534e" }}>एजेंट के पैसे वाले काम सिर्फ़ Android ऐप पर चलते हैं।</p>;
  }
  if (!store) {
    return <p style={{ color: "#57534e" }}>डेटाबेस खुल रहा है...</p>;
  }

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={startNewChat}
          disabled={busy || historyLoading}
          style={ghost(busy || historyLoading)}
        >
          नई बातचीत
        </button>
      </div>

      <div style={{ display: "grid", gap: 8, minHeight: 200 }}>
        {historyLoading && (
          <p style={{ color: "#78716c", fontSize: 14, margin: 0 }}>पुरानी बातचीत खुल रही है…</p>
        )}
        {!historyLoading && messages.length === 0 && (
          <p style={{ color: "#78716c", fontSize: 14, margin: 0 }}>{HELP}</p>
        )}
        {messages.map((m) => (
          <div key={m.id} style={m.role === "user" ? userBubble : botBubble}>
            <span style={{ whiteSpace: "pre-wrap" }}>{m.text}</span>

            {m.ledger?.open && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => decideLedger(m.id, m.ledger!.approvalId, "approve")}
                  style={primary(busy)}
                >
                  मंज़ूरी दें
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => decideLedger(m.id, m.ledger!.approvalId, "reject")}
                  style={ghost(busy)}
                >
                  रद्द करें
                </button>
              </div>
            )}

            {m.server && <ServerActionButtons msg={m} onDecide={decideServer} />}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send();
          }}
          placeholder="जैसे: udhaar Ramesh 500 chini, या poster Diwali sale"
          maxLength={300}
          disabled={historyLoading}
          style={{ flex: 1, padding: "12px 14px", borderRadius: 999, border: "1px solid #d4d4d4", fontSize: 16, font: "inherit" }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || historyLoading}
          style={primary(busy || historyLoading)}
        >
          भेजें
        </button>
      </div>
    </section>
  );
}

// server की मंज़ूरी के बटन: समय निकल गया हो या फ़ैसला हो चुका हो, तो बटन नहीं
function ServerActionButtons({
  msg,
  onDecide,
}: {
  msg: Msg;
  onDecide: (msgId: number, actionId: string, decision: "approve" | "reject") => void;
}) {
  const server = msg.server!;
  const expired = new Date(server.expiresAt).getTime() <= Date.now();

  if (server.state === "busy") {
    return <p style={{ margin: "8px 0 0", color: "#78716c", fontSize: 14 }}>हो रहा है…</p>;
  }
  if (server.state !== "idle") {
    const label: Record<Exclude<ServerState, "idle" | "busy">, string> = {
      done: "काम हो गया",
      rejected: "काम रद्द किया गया",
      failed: "काम नहीं हो पाया",
      expired: "समय निकल गया, काम दोबारा माँगें",
    };
    return <p style={{ margin: "8px 0 0", color: "#78716c", fontSize: 14 }}>{label[server.state]}</p>;
  }
  if (expired) {
    return <p style={{ margin: "8px 0 0", color: "#78716c", fontSize: 14 }}>समय निकल गया, काम दोबारा माँगें</p>;
  }

  return (
    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      <button type="button" onClick={() => onDecide(msg.id, server.actionId, "approve")} style={primary(false)}>
        मंज़ूरी दें
      </button>
      <button type="button" onClick={() => onDecide(msg.id, server.actionId, "reject")} style={ghost(false)}>
        रद्द करें
      </button>
    </div>
  );
}

const userBubble: CSSProperties = {
  justifySelf: "end",
  maxWidth: "85%",
  padding: "10px 14px",
  borderRadius: 16,
  background: "#1B1A17",
  color: "#fff",
  fontSize: 15,
};

const botBubble: CSSProperties = {
  justifySelf: "start",
  maxWidth: "90%",
  padding: "10px 14px",
  borderRadius: 16,
  background: "#fff",
  border: "1px solid #e5e5e5",
  fontSize: 15,
};

function primary(disabled: boolean): CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 999,
    border: "none",
    background: "#1B1A17",
    color: "#fff",
    fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

function ghost(disabled: boolean): CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 999,
    border: "1px solid #d4d4d4",
    background: "#fff",
    color: "#1B1A17",
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}