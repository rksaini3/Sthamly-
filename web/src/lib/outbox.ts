// Sthamly AI web: outbox. Net kamzor ho to sawal yahan safe rehta hai, jud te hi bhejte hain.
// Sirf login user ke sandesh yahan jaate hain (guest ka count server par hai, woh dobara nahi bhejte).
// Sirf text rakhte hain, koi file ya token nahi.

import { browserStore, type KeyValueStore } from "./storage";

export interface OutboxItem {
  id: string;
  text: string;
  conversationId: string | null;
  mode: string;
  createdAt: number;
}

export const OUTBOX_KEY = "sthamly_outbox_v1";
// Zyada jama na ho: 10 sandesh kaafi hain. Purane sabse pehle hatte hain.
export const OUTBOX_MAX_ITEMS = 10;

export function readOutbox(store: KeyValueStore = browserStore()): OutboxItem[] {
  const raw = store.get(OUTBOX_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isOutboxItem);
  } catch {
    return [];
  }
}

function isOutboxItem(value: unknown): value is OutboxItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.text === "string" &&
    v.text.length > 0 &&
    (typeof v.conversationId === "string" || v.conversationId === null) &&
    typeof v.mode === "string" &&
    typeof v.createdAt === "number"
  );
}

function writeOutbox(items: OutboxItem[], store: KeyValueStore): void {
  store.set(OUTBOX_KEY, JSON.stringify(items));
}

export function enqueue(
  input: Pick<OutboxItem, "text" | "conversationId" | "mode">,
  options: { store?: KeyValueStore; now?: number; id?: string } = {},
): OutboxItem[] {
  const store = options.store ?? browserStore();
  const item: OutboxItem = {
    id: options.id ?? crypto.randomUUID(),
    text: input.text,
    conversationId: input.conversationId,
    mode: input.mode,
    createdAt: options.now ?? Date.now(),
  };
  const next = [...readOutbox(store), item].slice(-OUTBOX_MAX_ITEMS);
  writeOutbox(next, store);
  return next;
}

export function removeFromOutbox(id: string, store: KeyValueStore = browserStore()): OutboxItem[] {
  const next = readOutbox(store).filter((item) => item.id !== id);
  writeOutbox(next, store);
  return next;
}