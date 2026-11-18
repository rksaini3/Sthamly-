import { redirect } from "next/navigation";
import { CONNECTORS } from "@/lib/connectors/registry";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AppsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/apps");

  // RLS के हिसाब से user सिर्फ़ अपने connections देख सकता है
  const { data } = await supabase
    .from("connector_connections")
    .select("connector_id, status")
    .eq("user_id", user.id);

  const connected = new Set(
    (data ?? []).filter((row) => row.status === "active").map((row) => row.connector_id),
  );

  return (
    <main className="page stack">
      <h1 style={{ margin: 0 }}>ऐप्स</h1>
      <p className="muted" style={{ margin: 0 }}>
        अपने दूसरे ऐप्स जोड़ें, ताकि एजेंट उनकी जानकारी से काम कर सके। आपकी इजाज़त के बिना कुछ नहीं बदलता।
      </p>

      {CONNECTORS.map((connector) => {
        const isConnected = connected.has(connector.id);
        // सभी scopes एक साथ मांगे जाते हैं; start route इन्हें connector की list से ही मिलाता है
        const scopes = encodeURIComponent(connector.scopes.map((s) => s.id).join(","));
        return (
          <div key={connector.id} className="card stack">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>{connector.name}</strong>
              {isConnected && <span style={{ color: "var(--accent)", fontWeight: 600 }}>जुड़ा है</span>}
            </div>
            <p className="muted" style={{ margin: 0 }}>
              {connector.description}
            </p>
            {!isConnected && (
              <a href={`/api/connectors/${connector.id}/start?scopes=${scopes}`} className="btn btn-primary btn-block">
                जोड़ें
              </a>
            )}
          </div>
        );
      })}
    </main>
  );
}