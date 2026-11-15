import { useEffect, useState } from "react";
import { openStore, type Store } from "./db";

const API_BASE = import.meta.env.VITE_API_BASE;

interface EventRow {
  id: number;
  kind: string;
  at: string;
}

export function App() {
  const [store, setStore] = useState<Store | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [recent, setRecent] = useState<EventRow[]>([]);
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [apiStatus, setApiStatus] = useState<string>("अभी जांच नहीं हुई");
  const [error, setError] = useState<string | null>(null);

  // App खुलते ही: DB खोलें, launch लिखें, फिर ताज़ा गिनती
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await openStore();
        await s.run("INSERT INTO app_events (kind, at) VALUES (?, ?)", ["launch", new Date().toISOString()]);
        const [{ n }] = await s.query<{ n: number }>("SELECT COUNT(*) AS n FROM app_events");
        const rows = await s.query<EventRow>("SELECT id, kind, at FROM app_events ORDER BY id DESC LIMIT 10");
        if (!cancelled) {
          setStore(s);
          setCount(n);
          setRecent(rows);
        }
      } catch (e) {
        if (!cancelled) setError(`डेटाबेस नहीं खुला: ${String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Internet आए या जाए तो status बदले
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Vercel API से CORS और पहुंच की जांच (Step 2 का तीसरा काम)
  async function checkApi() {
    if (!API_BASE) {
      setApiStatus("VITE_API_BASE सेट नहीं है");
      return;
    }
    setApiStatus("जांच हो रही है...");
    try {
      const res = await fetch(`${API_BASE}/api/health`, { cache: "no-store" });
      setApiStatus(res.ok ? `ठीक है (${res.status})` : `सर्वर ने ${res.status} दिया`);
    } catch (e) {
      // CORS गलत हो तो भी यहीं आता है: browser नेटवर्क error छिपा देता है
      setApiStatus(`पहुंच नहीं हुई (CORS या नेटवर्क): ${String(e)}`);
    }
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, margin: "8px 0" }}>Sthamly</h1>

      <p style={{ margin: "4px 0", color: online ? "#1a7f37" : "#b45309" }}>
        {online ? "Online" : "Offline: दुकान के काम फिर भी चलेंगे"}
      </p>

      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}

      <section style={{ marginTop: 16 }}>
        <strong>स्थानीय डेटा (SQLite)</strong>
        <p style={{ margin: "4px 0" }}>
          launch की कुल गिनती: {count ?? "..."}
          {store ? "" : " (DB अभी खुल रहा है)"}
        </p>
        <ul style={{ paddingLeft: 18, fontSize: 14 }}>
          {recent.map((r) => (
            <li key={r.id}>
              #{r.id} {r.kind} {r.at}
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: 16 }}>
        <button type="button" onClick={checkApi} style={{ padding: "10px 16px", borderRadius: 999 }}>
          सर्वर जांचें
        </button>
        <p style={{ margin: "8px 0", fontSize: 14 }}>{apiStatus}</p>
      </section>
    </main>
  );
}