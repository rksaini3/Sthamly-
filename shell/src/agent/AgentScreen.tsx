import { useEffect, useRef, useState, type CSSProperties } from "react";
import { IS_NATIVE, type Store } from "../db";
import { formatRupees } from "../ledger/money";
import { listParties } from "../ledger/repo";
import { createApproval, decideApproval, pendingApprovals, type LedgerPayload } from "./approvals";
import { parseIntent, sameName } from "./rules";

type Msg =
  | { id: number; role: "user" | "bot"; text: string }
  | { id: number; role: "bot"; text: string; card: { approvalId: number; open: boolean } };

const HELP = [
  "ये काम कर सकता हूँ:",
  "• poster Diwali sale 20% off",
  "• udhaar Ramesh 500 chini",
  "• paisa mila Ramesh 200",
  "• balance Ramesh",
  "पैसे या poster वाले काम पहले आपकी मंज़ूरी माँगेंगे।",
].join("\n");

function balanceText(paise: number): string {
  if (paise === 0) return "हिसाब बराबर है";
  return paise > 0 ? `लेना है ${formatRupees(paise)}` : `देना है ${formatRupees(-paise)}`;
}

export function AgentScreen({ store }: { store: Store | null }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const loaded = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  function push(msg: Omit<Msg, "id">) {
    const id = nextId.current++;
    setMessages((prev) => [...prev, { ...msg, id } as Msg]);
  }

  // App खुलने पर: पहले से खुली मंज़ूरियां card के रूप में वापस दिखें
  useEffect(() => {
    if (!store || loaded.current) return;
    loaded.current = true;
    pendingApprovals(store)
      .then((list) => {
        for (const a of list) {
          push({ role: "bot", text: a.summary, card: { approvalId: a.id, open: true } });
        }
      })
      .catch(() => undefined);
  }, [store]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function send() {
    const text = input.trim();
    if (!store || busy || text.length < 2) return;
    setInput("");
    push({ role: "user", text });
    setBusy(true);
    try {
      const intent = parseIntent(text);

      if (intent.type === "unknown") {
        push({ role: "bot", text: HELP });
        return;
      }

      if (intent.type === "poster") {
        const id = await createApproval(store, "poster", `"${intent.offerText}" का poster बनेगा`, {
          offerText: intent.offerText,
        });
        push({ role: "bot", text: `"${intent.offerText}" का poster बनेगा।`, card: { approvalId: id, open: true } });
        return;
      }

      // बाकी सब के लिए ग्राहक चाहिए
      const parties = await listParties(store);
      const name = intent.type === "balance" ? intent.name : intent.name;
      const party = parties.find((p) => sameName(p.name, name));
      if (!party) {
        push({ role: "bot", text: `"${name}" नाम का ग्राहक नहीं मिला। पहले "हिसाब" tab में जोड़ें।` });
        return;
      }

      if (intent.type === "balance") {
        push({ role: "bot", text: `${party.name}: ${balanceText(party.balancePaise)}` });
        return;
      }

      // उधार या भुगतान: paisa से जुड़ा है, इसलिए card आएगा
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
      push({ role: "bot", text: summary, card: { approvalId: id, open: true } });
    } catch (error) {
      push({ role: "bot", text: `कुछ गड़बड़ हुई: ${String(error)}` });
    } finally {
      setBusy(false);
    }
  }

  async function decide(msgId: number, approvalId: number, decision: "approve" | "reject") {
    if (!store || busy) return;
    setBusy(true);
    // card तुरंत बंद, ताकि दोबारा न दबे
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId && "card" in m ? { ...m, card: { ...m.card, open: false } } : m)),
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

  if (!IS_NATIVE) {
    return <p style={{ color: "#57534e" }}>एजेंट के पैसे वाले काम सिर्फ़ Android ऐप पर चलते हैं।</p>;
  }
  if (!store) {
    return <p style={{ color: "#57534e" }}>डेटाबेस खुल रहा है...</p>;
  }

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gap: 8, minHeight: 200 }}>
        {messages.length === 0 && <p style={{ color: "#78716c", fontSize: 14, margin: 0 }}>{HELP}</p>}
        {messages.map((m) => (
          <div key={m.id} style={m.role === "user" ? userBubble : botBubble}>
            <span style={{ whiteSpace: "pre-wrap" }}>{m.text}</span>
            {"card" in m && m.card.open && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => decide(m.id, m.card.approvalId, "approve")}
                  style={primary(busy)}
                >
                  मंज़ूरी दें
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => decide(m.id, m.card.approvalId, "reject")}
                  style={ghost(busy)}
                >
                  रद्द करें
                </button>
              </div>
            )}
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
          placeholder="जैसे: udhaar Ramesh 500 chini"
          maxLength={300}
          style={{ flex: 1, padding: "12px 14px", borderRadius: 999, border: "1px solid #d4d4d4", fontSize: 16, font: "inherit" }}
        />
        <button type="button" onClick={() => void send()} disabled={busy} style={primary(busy)}>
          भेजें
        </button>
      </div>
    </section>
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