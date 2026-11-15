import { useEffect, useState, type CSSProperties } from "react";
import { AgentScreen } from "./agent/AgentScreen";
import { IS_NATIVE, openStore, type Store } from "./db";
import { LedgerScreen } from "./ledger/LedgerScreen";
import { PosterScreen } from "./poster/PosterScreen";

const API_BASE = import.meta.env.VITE_API_BASE;

interface EventRow {
  id: number;
  kind: string;
  at: string;
}

type View = "home" | "poster" | "ledger" | "agent";

export function App() {
  const [view, setView] = useState<View>("home");
  const [store, setStore] = useState<Store | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [recent, setRecent] = useState<EventRow[]>([]);
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [apiStatus, setApiStatus] = useState<string>("अभी जांच नहीं हुई");
  const [error, setError] = useState<string | null>(null);

  // App खुलते ही: DB खोलें (migrations समेत), launch लिखें, फिर ताज़ा गिनती
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
      setApiStatus(`पहुंच नहीं हुई (CORS या नेटवर्क): ${String(e)}`);
    }
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, margin: "8px 0" }}>Sthamly</h1>

      <p style={{ margin: "4px 0", color: online ? "#1a7f37" : "#b45309" }}>
        {online ? "Online" : "Offline: दुकान के काम फिर भी चलेंगे"}
      </p>

      <nav style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        <button type="button" onClick={() => setView("home")} style={tabStyle(view === "home")}>
          होम
        </button>
        <button type="button" onClick={() => setView("poster")} style={tabStyle(view === "poster")}>
          पोस्टर
        </button>
        <button type="button" onClick={() => setView("ledger")} style={tabStyle(view === "ledger")}>
          हिसाब
        </button>
        <button type="button" onClick={() => setView("agent")} style={tabStyle(view === "agent")}>
          एजेंट
        </button>
      </nav>

      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}

      {view === "poster" && <PosterScreen />}
      {view === "ledger" && <LedgerScreen store={store} />}
      {view === "agent" && <AgentScreen store={store} />}

      {view === "home" && (
        <>
          <section style={{ marginTop: 8 }}>
            <strong>स्थानीय डेटा (SQLite)</strong>
            <p style={{ margin: "4px 0" }}>
              launch की कुल गिनती: {count ?? "..."}
              {store ? "" : " (DB अभी खुल रहा है)"}
            </p>
            {!IS_NATIVE && <p style={{ fontSize: 13, color: "#78716c" }}>Browser मोड: SQLite सिर्फ़ Android पर है।</p>}
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
        </>
      )}
    </main>
  );
}

function tabStyle(active: boolean): CSSProperties {
  return {
    padding: "8px 16px",
    borderRadius: 999,
    border: active ? "2px solid #1B1A17" : "1px solid #d4d4d4",
    background: active ? "#1B1A17" : "#fff",
    color: active ? "#fff" : "#1B1A17",
    fontWeight: 600,
    cursor: "pointer",
  };
}