// Outbox ke tests: jodna, hatana, sirf sahi entries padhna, aur seema.
import { describe, expect, it } from "vitest";
import { createMemoryStore } from "./storage";
import { OUTBOX_KEY, OUTBOX_MAX_ITEMS, enqueue, readOutbox, removeFromOutbox } from "./outbox";

describe("outbox", () => {
  it("sandesh jodta hai aur wapas padhta hai", () => {
    const store = createMemoryStore();
    enqueue({ text: "नमस्ते", conversationId: null, mode: "chat" }, { store, id: "a", now: 1 });
    const items = readOutbox(store);
    expect(items).toHaveLength(1);
    expect(items[0]?.text).toBe("नमस्ते");
  });

  it("hatata hai id se", () => {
    const store = createMemoryStore();
    enqueue({ text: "एक", conversationId: null, mode: "chat" }, { store, id: "a" });
    enqueue({ text: "दो", conversationId: null, mode: "chat" }, { store, id: "b" });
    removeFromOutbox("a", store);
    expect(readOutbox(store).map((i) => i.id)).toEqual(["b"]);
  });

  it("seema se zyada ho to purane hat jaate hain", () => {
    const store = createMemoryStore();
    for (let i = 0; i < OUTBOX_MAX_ITEMS + 3; i++) {
      enqueue({ text: `m${i}`, conversationId: null, mode: "chat" }, { store, id: `id${i}` });
    }
    const items = readOutbox(store);
    expect(items).toHaveLength(OUTBOX_MAX_ITEMS);
    expect(items[0]?.text).toBe("m3");
  });

  it("kharab JSON ho to khaali list, crash nahi", () => {
    const store = createMemoryStore();
    store.set(OUTBOX_KEY, "{not json");
    expect(readOutbox(store)).toEqual([]);
  });

  it("galat entries chhod deta hai", () => {
    const store = createMemoryStore();
    store.set(
      OUTBOX_KEY,
      JSON.stringify([{ id: "x", text: "", conversationId: null, mode: "chat", createdAt: 1 }, { id: "ok", text: "हाँ", conversationId: null, mode: "chat", createdAt: 2 }]),
    );
    expect(readOutbox(store).map((i) => i.id)).toEqual(["ok"]);
  });
});