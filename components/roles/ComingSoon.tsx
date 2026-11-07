import Link from "next/link";
import { ROLE_INFO } from "@/lib/roles";
import type { Role } from "@/types/domain";

export function ComingSoon({ role }: { role: Role }) {
  const info = ROLE_INFO[role];
  return (
    <div className="card stack">
      <strong>{info.label} मोड</strong>
      <p className="muted" style={{ margin: 0 }}>
        {info.hint}। यह मोड जल्द आएगा।
      </p>
      <Link href="/role" className="btn btn-ghost btn-block">
        भूमिका बदलें
      </Link>
    </div>
  );
}