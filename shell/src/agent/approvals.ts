import type { Store } from "../db";
import { addEntry, type EntryKind } from "../ledger/repo";

export type ApprovalKind = "ledger_entry" | "poster";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "done" | "failed";

export interface LedgerPayload {
  partyId: number;
  partyName: string;
  kind: EntryKind;
  amountPaise: number;
  note: string | null;
}
export interface PosterPayload {
  offerText: string;
}
export type ApprovalPayload = LedgerPayload | PosterPayload;

export interface Approval {
  id: number;
  kind: ApprovalKind;
  summary: string;
  payload: ApprovalPayload;
  status: ApprovalStatus;
  expiresAt: string;
}

// Doc के हिसाब से: मंज़ूरी 30 मिनट तक खुली रहती है
const TTL_MS = 30 * 60 * 1000;

interface Row {
  id: number;
  kind: ApprovalKind;
  summary: string;
  payload: string;
  status: ApprovalStatus;
  expires_at: string;
}

function toApproval(row: Row): Approval {
  return {
    id: row.id,
    kind: row.kind,
    summary: row.summary,
    payload: JSON.parse(row.payload) as ApprovalPayload,
    status: row.status,
    expiresAt: row.expires_at,
  };
}

async function loadRow(store: Store, id: number): Promise<Row | undefined> {
  const [row] = await store.query<Row>(
    "SELECT id, kind, summary, payload, status, expires_at FROM approvals WHERE id = ?",
    [id],
  );
  return row;
}

async function setStatus(store: Store, id: number, status: ApprovalStatus): Promise<void> {
  await store.run("UPDATE approvals SET status = ?, decided_at = ? WHERE id = ?", [
    status,
    new Date().toISOString(),
    id,
  ]);
}

/** नई मंज़ूरी बनाएं। summary user को card में दिखेगी। */
export async function createApproval(
  store: Store,
  kind: ApprovalKind,
  summary: string,
  payload: ApprovalPayload,
): Promise<number> {
  const now = new Date();
  await store.run(
    "INSERT INTO approvals (kind, summary, payload, status, created_at, expires_at) VALUES (?, ?, ?, 'pending', ?, ?)",
    [
      kind,
      summary.slice(0, 200),
      JSON.stringify(payload),
      now.toISOString(),
      new Date(now.getTime() + TTL_MS).toISOString(),
    ],
  );
  const [row] = await store.query<{ id: number }>("SELECT last_insert_rowid() AS id");
  if (!row) throw new Error("मंज़ूरी का id नहीं मिला");
  return row.id;
}

/** अभी खुली (pending और समय के अंदर) मंज़ूरियां, नई पहले। */
export async function pendingApprovals(store: Store): Promise<Approval[]> {
  const rows = await store.query<Row>(
    `SELECT id, kind, summary, payload, status, expires_at
     FROM approvals
     WHERE status = 'pending' AND expires_at > ?
     ORDER BY id DESC`,
    [new Date().toISOString()],
  );
  return rows.map(toApproval);
}

export type DecideResult = { ok: true; message: string } | { ok: false; message: string };

/**
 * मंज़ूरी या रद्द करें। सिर्फ़ pending को बदलता है, इसलिए दो बार दबाने पर दूसरी बार कुछ नहीं होता।
 */
export async function decideApproval(store: Store, id: number, decision: "approve" | "reject"): Promise<DecideResult> {
  const row = await loadRow(store, id);
  if (!row) return { ok: false, message: "यह काम नहीं मिला" };
  if (row.status !== "pending") return { ok: false, message: "इस पर पहले ही फ़ैसला हो चुका है" };

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await setStatus(store, id, "expired");
    return { ok: false, message: "मंज़ूरी का समय निकल गया, काम दोबारा माँगें" };
  }

  if (decision === "reject") {
    await store.run("UPDATE approvals SET status = 'rejected', decided_at = ? WHERE id = ? AND status = 'pending'", [
      new Date().toISOString(),
      id,
    ]);
    return { ok: true, message: "काम रद्द कर दिया गया" };
  }

  // पहले approved करें, ताकि दोबारा दबाने पर काम दो बार न हो
  await store.run("UPDATE approvals SET status = 'approved', decided_at = ? WHERE id = ? AND status = 'pending'", [
    new Date().toISOString(),
    id,
  ]);
  const after = await loadRow(store, id);
  if (after?.status !== "approved") return { ok: false, message: "इस पर पहले ही फ़ैसला हो चुका है" };

  try {
    const approval = toApproval(row);
    if (approval.kind === "ledger_entry") {
      const p = approval.payload as LedgerPayload;
      await addEntry(store, { partyId: p.partyId, kind: p.kind, amountPaise: p.amountPaise, note: p.note });
      await setStatus(store, id, "done");
      return { ok: true, message: "हिसाब में दर्ज हो गया" };
    }
    // poster: यहाँ सिर्फ़ मंज़ूरी है। बनाना और शेयर करना “पोस्टर” tab में, आपके हाथ से।
    await setStatus(store, id, "done");
    return { ok: true, message: "पोस्टर की मंज़ूरी हो गई। “पोस्टर” tab में जाकर बनाएं और शेयर करें।" };
  } catch (error) {
    await setStatus(store, id, "failed");
    return { ok: false, message: `नहीं हो पाया: ${String(error)}` };
  }
}