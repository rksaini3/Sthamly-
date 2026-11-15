import { useEffect, useState, type CSSProperties } from "react";
import { IS_NATIVE, type Store } from "../db";
import { formatRupees, parseRupees } from "./money";
import {
  addEntry,
  addParty,
  entriesFor,
  listParties,
  type EntryKind,
  type EntryRow,
  type PartySummary,
} from "./repo";

const NAME_MAX = 40;

function balanceText(paise: number): string {
  if (paise === 0) return "हिसाब बराबर";
  return paise > 0 ? `लेना है ${formatRupees(paise)}` : `देना है ${formatRupees(paise)}`;
}

function dateText(iso: string): string {
  return new Date(iso).toLocaleDateString("hi-IN", { day: "numeric", month: "short" });
}

export function LedgerScreen({ store }: { store: Store | null }) {
  const [parties, setParties] = useState<PartySummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [entries, setEntries] = useState<EntryRow[]>([]);

  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const [kind, setKind] = useState<EntryKind>("sale");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = parties.find((p) => p.id === selectedId) ?? null;

  async function refresh(s: Store, partyId: number | null) {
    setParties(await listParties(s));
    setEntries(partyId ? await entriesFor(s, partyId) : []);
  }

  useEffect(() => {
    if (!store) return;
    refresh(store, selectedId).catch((e) => setStatus(`हिसाब नहीं पढ़ा गया: ${String(e)}`));
  }, [store, selectedId]);

  async function onAddParty() {
    if (!store || busy) return;
    const name = newName.trim();
    if (name.length < 2 || name.length > NAME_MAX) {
      setStatus(`नाम 2 से ${NAME_MAX} अक्षर का होना चाहिए`);
      return;
    }
    if (newPhone && !/^\d{10}$/.test(newPhone)) {
      setStatus("फ़ोन 10 अंकों का होना चाहिए, या खाली छोड़ें");
      return;
    }
    setBusy(true);
    try {
      const id = await addParty(store, name, newPhone || null);
      setNewName("");
      setNewPhone("");
      setSelectedId(id);
      setStatus("ग्राहक जुड़ गया");
    } catch (e) {
      setStatus(`ग्राहक नहीं जुड़ पाया: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onAddEntry() {
    if (!store || !selected || busy) return;
    const paise = parseRupees(amount);
    if (paise === null) {
      setStatus("रकम सही लिखें, जैसे 250 या 99.50");
      return;
    }
    setBusy(true);
    try {
      await addEntry(store, {
        partyId: selected.id,
        kind,
        amountPaise: paise,
        note: note.trim() || null,
      });
      setAmount("");
      setNote("");
      await refresh(store, selected.id);
      setStatus("दर्ज हो गया");
    } catch (e) {
      setStatus(`दर्ज नहीं हुआ: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  if (!IS_NATIVE) {
    return <p style={{ color: "#57534e" }}>हिसाब सिर्फ़ Android ऐप पर चलता है। इसे फ़ोन पर खोलकर देखें।</p>;
  }
  if (!store) {
    return <p style={{ color: "#57534e" }}>डेटाबेस खुल रहा है...</p>;
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={card}>
        <strong>नया ग्राहक</strong>
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <input
            placeholder="नाम"
            value={newName}
            maxLength={NAME_MAX}
            onChange={(e) => setNewName(e.target.value)}
            style={input}
          />
          <input
            placeholder="फ़ोन (ऐच्छिक)"
            inputMode="numeric"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            style={input}
          />
          <button type="button" onClick={onAddParty} disabled={busy} style={primaryBtn(busy)}>
            ग्राहक जोड़ें
          </button>
        </div>
      </div>

      <div style={card}>
        <strong>ग्राहक</strong>
        {parties.length === 0 && <p style={muted}>अभी कोई ग्राहक नहीं है।</p>}
        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
          {parties.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              style={partyRow(p.id === selectedId)}
            >
              <span>{p.name}</span>
              <span style={{ color: p.balancePaise > 0 ? "#b45309" : p.balancePaise < 0 ? "#1a7f37" : "#57534e" }}>
                {balanceText(p.balancePaise)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div style={card}>
          <strong>{selected.name}</strong>
          <p style={{ margin: "4px 0 12px", fontSize: 18, fontWeight: 700 }}>{balanceText(selected.balancePaise)}</p>

          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button type="button" onClick={() => setKind("sale")} style={kindChip(kind === "sale")}>
              उधार दिया
            </button>
            <button type="button" onClick={() => setKind("payment")} style={kindChip(kind === "payment")}>
              पैसा मिला
            </button>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <input
              placeholder="रकम (₹)"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={input}
            />
            <input
              placeholder="ब्योरा (ऐच्छिक, जैसे: 2 किलो चीनी)"
              value={note}
              maxLength={80}
              onChange={(e) => setNote(e.target.value)}
              style={input}
            />
            <button type="button" onClick={onAddEntry} disabled={busy} style={primaryBtn(busy)}>
              दर्ज करें
            </button>
          </div>

          <div style={{ marginTop: 16, display: "grid", gap: 6 }}>
            {entries.length === 0 && <p style={muted}>अभी कोई लेन-देन नहीं।</p>}
            {entries.map((e) => (
              <div key={e.id} style={entryRow}>
                <span>
                  <strong>{e.kind === "sale" ? "उधार दिया" : "पैसा मिला"}</strong>
                  {e.note ? ` · ${e.note}` : ""}
                  <br />
                  <span style={{ fontSize: 12, color: "#78716c" }}>{dateText(e.createdAt)}</span>
                </span>
                <span style={{ fontWeight: 700, color: e.kind === "sale" ? "#b45309" : "#1a7f37" }}>
                  {e.kind === "sale" ? "+" : "−"}
                  {formatRupees(e.amountPaise)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {status && (
        <p role="status" style={{ margin: 0, fontSize: 14, color: "#57534e" }}>
          {status}
        </p>
      )}
    </section>
  );
}

const card: CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  padding: 14,
  background: "#fff",
};

const input: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d4d4d4",
  fontSize: 16,
  font: "inherit",
};

const muted: CSSProperties = { margin: "8px 0 0", fontSize: 14, color: "#78716c" };

const entryRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "8px 0",
  borderBottom: "1px solid #f0f0f0",
  fontSize: 15,
};

function primaryBtn(disabled: boolean): CSSProperties {
  return {
    padding: "12px 16px",
    borderRadius: 999,
    border: "none",
    background: "#1B1A17",
    color: "#fff",
    fontWeight: 700,
    fontSize: 15,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

function partyRow(active: boolean): CSSProperties {
  return {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 10,
    border: active ? "2px solid #1B1A17" : "1px solid #e5e5e5",
    background: "#fff",
    fontSize: 15,
    textAlign: "left",
    cursor: "pointer",
  };
}

function kindChip(active: boolean): CSSProperties {
  return {
    flex: 1,
    padding: "8px 10px",
    borderRadius: 999,
    border: active ? "2px solid #1B1A17" : "1px solid #d4d4d4",
    background: active ? "#1B1A17" : "#fff",
    color: active ? "#fff" : "#1B1A17",
    fontWeight: 600,
    cursor: "pointer",
  };
}