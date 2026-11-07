"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROLE_INFO } from "@/lib/roles";
import { ROLES, type Role } from "@/types/domain";

export default function RolePage() {
  const router = useRouter();
  const [busy, setBusy] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(role: Role) {
    setError(null);
    setBusy(role);
    try {
      const res = await fetch("/api/profile/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        setError("भूमिका सेव नहीं हो पाई, दोबारा कोशिश करें");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("नेटवर्क की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="page stack">
      <div className="stack" style={{ gap: 6 }}>
        <p className="brand">Sthamly</p>
        <h1>आप कौन हैं?</h1>
        <p className="muted">इससे तय होगा कि आपको क्या दिखे। बाद में बदल सकते हैं।</p>
      </div>

      {ROLES.map((role) => {
        const info = ROLE_INFO[role];
        return (
          <button
            key={role}
            type="button"
            className="card"
            onClick={() => choose(role)}
            disabled={busy !== null}
            style={{ textAlign: "left", cursor: "pointer" }}
          >
            <strong>{info.label}</strong>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {info.hint}
            </p>
            {!info.live && (
              <p className="muted" style={{ margin: "4px 0 0" }}>
                जल्द आएगा
              </p>
            )}
          </button>
        );
      })}

      {error && <p className="alert alert-error">{error}</p>}
    </main>
  );
}