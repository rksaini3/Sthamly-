"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROLE_INFO } from "@/lib/roles";
import { ROLES, type Role } from "@/types/domain";

export function AgentList({ current }: { current: Role | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(role: Role) {
    // जल्द आने वाला एजेंट: कोई request नहीं
    if (!ROLE_INFO[role].live) return;
    // जो पहले से चुना है, उसे दोबारा सेव करने की ज़रूरत नहीं
    if (role === current) return;
    setError(null);
    setBusy(role);
    try {
      const res = await fetch("/api/profile/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        setError("एजेंट सेव नहीं हो पाया, दोबारा कोशिश करें");
        return;
      }
      router.refresh();
    } catch {
      setError("नेटवर्क की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      {ROLES.map((role) => {
        const info = ROLE_INFO[role];
        const isCurrent = role === current;
        const comingSoon = !info.live;
        return (
          <button
            key={role}
            type="button"
            className="card"
            onClick={() => choose(role)}
            disabled={busy !== null || comingSoon || isCurrent}
            aria-disabled={comingSoon}
            style={{
              textAlign: "left",
              cursor: comingSoon || isCurrent ? "default" : "pointer",
              opacity: comingSoon ? 0.6 : 1,
              borderColor: isCurrent ? "var(--accent)" : undefined,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>{info.label}</strong>
              {isCurrent && <span style={{ color: "var(--accent)", fontWeight: 600 }}>अभी चुना है</span>}
              {comingSoon && <span className="muted">जल्द आएगा</span>}
            </div>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {info.hint}
            </p>
          </button>
        );
      })}

      {error && <p className="alert alert-error">{error}</p>}
    </div>
  );
}