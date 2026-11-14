import Link from "next/link";
import { Children, cloneElement, isValidElement, type ReactNode } from "react";

// ChatGPT जैसी सेटिंग्स सूची: गोल कोनों वाला डिब्बा, हर पंक्ति के बीच पतली लाइन

export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  const rows = Children.toArray(children).map((child, i) =>
    isValidElement<{ first?: boolean }>(child) ? cloneElement(child, { first: i === 0 }) : child,
  );
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {title && (
        <span className="muted" style={{ fontSize: 13, padding: "0 12px" }}>
          {title}
        </span>
      )}
      <div
        style={{
          borderRadius: 20,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          overflow: "hidden",
        }}
      >
        {rows}
      </div>
    </section>
  );
}

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function SettingsRow({
  href,
  label,
  value,
  right,
  accent,
  first,
}: {
  href?: string;
  label: string;
  value?: string;
  right?: ReactNode;
  accent?: boolean;
  first?: boolean;
}) {
  const style = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minHeight: 52,
    padding: "0 16px",
    color: accent ? "#3b6cf6" : "var(--ink)",
    textDecoration: "none",
    fontSize: 16,
    borderTop: first ? "none" : "1px solid var(--line)",
  } as const;

  const content = (
    <>
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      {value && (
        <span
          className="muted"
          style={{ fontSize: 15, maxWidth: "58%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {value}
        </span>
      )}
      {right}
      {href && <Chevron />}
    </>
  );

  return href ? (
    <Link href={href} style={style}>
      {content}
    </Link>
  ) : (
    <div style={style}>{content}</div>
  );
}