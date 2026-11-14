// फ़ोन में चैट की सेव की हुई जानकारी, ताकि इंटरनेट न हो तब भी पुरानी बातचीत दिखे।
// हर काम try/catch में है: browser storage बंद हो तो ऐप फिर भी चलता है।

const CHATS_KEY = "sthamly:chats";
const CHAT_PREFIX = "sthamly:chat:";
const RUNTIME_CACHE = "sthamly-runtime-v2";
const MAX_MESSAGES = 60;

export interface CachedMessage {
  role: "user" | "assistant";
  text: string;
}

export function saveChatCache(threadId: string, messages: CachedMessage[]): void {
  try {
    const trimmed = messages.slice(-MAX_MESSAGES);
    localStorage.setItem(CHAT_PREFIX + threadId, JSON.stringify(trimmed));
  } catch {
    // जगह भर गई या storage बंद है
  }
}

export function loadChatCache(threadId: string): CachedMessage[] | null {
  try {
    const raw = localStorage.getItem(CHAT_PREFIX + threadId);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    return Array.isArray(data) ? (data as CachedMessage[]) : null;
  } catch {
    return null;
  }
}

export function forgetChatCache(threadId: string): void {
  try {
    localStorage.removeItem(CHAT_PREFIX + threadId);
  } catch {
    // ignore
  }
}

export function saveChatList<T>(chats: T[]): void {
  try {
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
  } catch {
    // ignore
  }
}

export function loadChatList<T>(): T[] | null {
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    return Array.isArray(data) ? (data as T[]) : null;
  } catch {
    return null;
  }
}

// लॉग-आउट पर: चैट की सारी सेव की हुई जानकारी हटे, ताकि अगला व्यक्ति न देखे
export async function clearLocalChatCache(): Promise<void> {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sthamly:chat")) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore
  }
  try {
    if ("caches" in window) await caches.delete(RUNTIME_CACHE);
  } catch {
    // ignore
  }
}