const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
  focusable: false as const,
};

export function CommentIcon({ size = 19 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24">
      <path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.1A8.5 8.5 0 1 1 21 12z" />
    </svg>
  );
}

export function ShareIcon({ size = 19 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24">
      <path d="M12 3v12" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

export function SendIcon({ size = 19 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24">
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

export function CopyIcon({ size = 19 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function FlagIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24">
      <path d="M4 22V4" />
      <path d="M4 4h12l-2 4 2 4H4" />
    </svg>
  );
}