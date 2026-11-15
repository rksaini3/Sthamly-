import type { Store } from "../db";

export type EntryKind = "sale" | "payment";

export interface PartySummary {
  id: number;
  name: string;
  phone: string | null;
  // + मतलब ग्राहक ने देना है (उधार बाकी), − मतलब दुकान को देना है
  balancePaise: number;
}

export interface EntryRow {
  id: number;
  kind: EntryKind;
  amountPaise: number;
  note: string | null;
  createdAt: string;
}

export async function addParty(store: Store, name: string, phone: string | null): Promise<number> {
  await store.run("INSERT INTO parties (name, phone, created_at) VALUES (?, ?, ?)", [
    name,
    phone,
    new Date().toISOString(),
  ]);
  const [row] = await store.query<{ id: number }>("SELECT last_insert_rowid() AS id");
  if (!row) throw new Error("ग्राहक का id नहीं मिला");
  return row.id;
}

/** सारे ग्राहक, उनके balance के साथ। बड़ा उधार ऊपर। */
export async function listParties(store: Store): Promise<PartySummary[]> {
  return store.query<PartySummary>(`
    SELECT p.id AS id,
           p.name AS name,
           p.phone AS phone,
           COALESCE(SUM(CASE WHEN e.kind = 'sale' THEN e.amount_paise
                             WHEN e.kind = 'payment' THEN -e.amount_paise
                             ELSE 0 END), 0) AS balancePaise
    FROM parties p
    LEFT JOIN entries e ON e.party_id = p.id
    GROUP BY p.id
    ORDER BY balancePaise DESC, p.name ASC
  `);
}

export async function addEntry(
  store: Store,
  input: { partyId: number; kind: EntryKind; amountPaise: number; note: string | null },
): Promise<void> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new Error("रकम सही नहीं है");
  }
  await store.run(
    "INSERT INTO entries (party_id, kind, amount_paise, note, created_at) VALUES (?, ?, ?, ?, ?)",
    [input.partyId, input.kind, input.amountPaise, input.note, new Date().toISOString()],
  );
}

/** एक ग्राहक की ताज़ा entries (नई पहले), सीमा 200। */
export async function entriesFor(store: Store, partyId: number): Promise<EntryRow[]> {
  return store.query<EntryRow>(
    `SELECT id, kind, amount_paise AS amountPaise, note, created_at AS createdAt
     FROM entries
     WHERE party_id = ?
     ORDER BY id DESC
     LIMIT 200`,
    [partyId],
  );
}