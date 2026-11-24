// Sthamly AI web: chhoti storage ki parat. localStorage band ho to memory mein chalta hai.
// Har read/write try/catch mein hai: private mode ya blocked site data par app nahi tootti.

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

// Memory fallback: ek hi session ke liye.
export function createMemoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    get: (key) => data.get(key) ?? null,
    set: (key, value) => {
      data.set(key, value);
    },
  };
}

const memoryFallback = createMemoryStore();

// Browser ka localStorage, na mile ya kaam na kare to memory.
export function browserStore(): KeyValueStore {
  return {
    get(key) {
      try {
        return globalThis.localStorage.getItem(key);
      } catch {
        return memoryFallback.get(key);
      }
    },
    set(key, value) {
      try {
        globalThis.localStorage.setItem(key, value);
      } catch {
        memoryFallback.set(key, value);
      }
    },
  };
}