import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite";
import { Capacitor } from "@capacitor/core";

const DB_NAME = "sthamly";
const DB_VERSION = 2;

// Android पर असली SQLite चल रहा है या नहीं (browser में नहीं)
export const IS_NATIVE = Capacitor.isNativePlatform();

// हर migration एक नया index है। पुराने migrations कभी न बदलें, सिर्फ़ नए जोड़ें।
const MIGRATIONS: string[][] = [
  // v0 -> v1: launch log
  [
    `CREATE TABLE IF NOT EXISTS app_events (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       kind TEXT NOT NULL,
       at TEXT NOT NULL
     )`,
  ],
  // v1 -> v2: हिसाब-उधार
  [
    `CREATE TABLE IF NOT EXISTS parties (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT NOT NULL,
       phone TEXT,
       created_at TEXT NOT NULL
     )`,
    // entries कभी delete नहीं होतीं। गलती सुधारने के लिए उल्टी entry डाली जाती है।
    `CREATE TABLE IF NOT EXISTS entries (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       party_id INTEGER NOT NULL REFERENCES parties(id),
       kind TEXT NOT NULL CHECK (kind IN ('sale', 'payment')),
       amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
       note TEXT,
       created_at TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS entries_party_idx ON entries(party_id)`,
  ],
];

export interface Store {
  run(sql: string, params?: unknown[]): Promise<void>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

// Browser (dev) के लिए memory fallback। सिर्फ़ launch log समझता है;
// हिसाब जैसी queries खाली लौटाता है, ताकि गलत डेटा न दिखे।
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
      if (sql.includes("PRAGMA user_version")) return [{ user_version: 0 }] as unknown as T[];
      if (sql.includes("app_events") && sql.includes("COUNT(*)")) {
        return [{ n: events.length }] as unknown as T[];
      }
      if (sql.includes("app_events")) return events.slice(-10).reverse() as unknown as T[];
      return [];
    },
  };
}

// Android पर असली SQLite (encryption बाद में SQLCipher से जुड़ेगा)
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

/** DB खोलें, foreign keys चालू करें, और लंबित migrations चलाएं। App शुरू होने पर एक बार। */
export async function openStore(): Promise<Store> {
  const store = IS_NATIVE ? await nativeStore() : memoryStore();

  // SQLite में foreign keys हर connection पर अलग से चालू करनी पड़ती हैं
  await store.run("PRAGMA foreign_keys = ON");

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