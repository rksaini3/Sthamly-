import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite";
import { Capacitor } from "@capacitor/core";

const DB_NAME = "sthamly";
const DB_VERSION = 1;

// हर बदलाव एक नया migration बनेगा। पुराने migrations कभी न बदलें।
const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE IF NOT EXISTS app_events (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       kind TEXT NOT NULL,
       at TEXT NOT NULL
     )`,
  ],
];

export interface Store {
  run(sql: string, params?: unknown[]): Promise<void>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

// Browser (dev) के लिए memory fallback: sirf यह जांचने के लिए कि UI सही चलता है
function memoryStore(): Store {
  const events: { id: number; kind: string; at: string }[] = [];
  let nextId = 1;
  return {
    async run(sql, params = []) {
      if (sql.startsWith("INSERT INTO app_events")) {
        events.push({ id: nextId++, kind: String(params[0]), at: String(params[1]) });
      }
    },
    async query<T>(sql: string): Promise<T[]> {
      if (sql.includes("COUNT(*)")) return [{ n: events.length }] as unknown as T[];
      if (sql.includes("PRAGMA user_version")) return [{ user_version: 0 }] as unknown as T[];
      return events.slice(-10).reverse() as unknown as T[];
    },
  };
}

// Android पर असली SQLite (encrypted नहीं, encryption बाद में SQLCipher से जुड़ेगा)
async function nativeStore(): Promise<Store> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const conn: SQLiteDBConnection = await sqlite.createConnection(DB_NAME, false, "no-encryption", 1, false);
  await conn.open();

  return {
    async run(sql, params = []) {
      await conn.run(sql, params, false);
    },
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const res = await conn.query(sql, params);
      return (res.values ?? []) as T[];
    },
  };
}

/** DB खोलें और लंबित migrations चलाएं। App शुरू होने पर एक बार। */
export async function openStore(): Promise<Store> {
  const store = Capacitor.isNativePlatform() ? await nativeStore() : memoryStore();

  const [{ user_version: current }] = await store.query<{ user_version: number }>("PRAGMA user_version");
  for (let v = current; v < DB_VERSION; v++) {
    for (const sql of MIGRATIONS[v] ?? []) {
      await store.run(sql);
    }
    // migration पूरा होने पर version बढ़ाएं
    await store.run(`PRAGMA user_version = ${v + 1}`);
  }
  return store;
}