// Sthamly AI web: chhota aur surakshit markdown parser (jawab ke text ke liye).
// Bahar ka HTML kabhi nahi banta: output sirf data hai, React use elements mein badalta hai.
// Adhoora text (stream ke beech) bhi bina toote dikhta hai: band na hua ** ya ` seedha text rehta hai.

export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; c: Inline[] }
  | { t: "i"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "a"; href: string; c: Inline[] };

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "h"; level: 1 | 2 | 3; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] }
  | { t: "code"; v: string };

// Sirf http aur https links. javascript: jaise koi bhi aur protocol link nahi banta.
export function safeHref(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

interface Pattern {
  re: RegExp;
  build: (m: RegExpExecArray) => Inline | null;
}

const PATTERNS: Pattern[] = [
  { re: /`([^`\n]+)`/, build: (m) => ({ t: "code", v: m[1] ?? "" }) },
  {
    re: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/,
    build: (m) => {
      const href = safeHref(m[2] ?? "");
      return href === null ? null : { t: "a", href, c: parseInline(m[1] ?? "") };
    },
  },
  { re: /\*\*(\S(?:[^\n]*?\S)?)\*\*/, build: (m) => ({ t: "b", c: parseInline(m[1] ?? "") }) },
  {
    re: /(?<![*\w])\*(\S(?:[^*\n]*?\S)?)\*(?![*\w])/,
    build: (m) => ({ t: "i", c: parseInline(m[1] ?? "") }),
  },
  {
    re: /https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"]/,
    build: (m) => {
      const href = safeHref(m[0]);
      return href === null ? null : { t: "a", href, c: [{ t: "text", v: m[0] }] };
    },
  },
];

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;

  while (rest.length > 0) {
    let best: { index: number; length: number; node: Inline } | null = null;

    for (const p of PATTERNS) {
      const m = p.re.exec(rest);
      if (m === null) continue;
      if (best !== null && m.index >= best.index) continue;
      const node = p.build(m);
      if (node === null) continue;
      best = { index: m.index, length: m[0].length, node };
    }

    if (best === null) {
      out.push({ t: "text", v: rest });
      break;
    }
    if (best.index > 0) out.push({ t: "text", v: rest.slice(0, best.index) });
    out.push(best.node);
    rest = rest.slice(best.index + best.length);
  }

  return out;
}

const HEADING_RE = /^\s{0,3}(#{1,3})\s+(.*)$/;
const UL_RE = /^\s*[-*•]\s+(.*)$/;
const OL_RE = /^\s*\d{1,3}[.)]\s+(.*)$/;
const FENCE_RE = /^\s*```/;

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    if (FENCE_RE.test(line)) {
      const body: string[] = [];
      i += 1;
      // Fence band na hua ho (stream beech mein) to aakhir tak code maana jaata hai.
      while (i < lines.length && !FENCE_RE.test(lines[i] ?? "")) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      i += 1;
      blocks.push({ t: "code", v: body.join("\n") });
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = Math.min(3, (heading[1] ?? "#").length) as 1 | 2 | 3;
      blocks.push({ t: "h", level, c: parseInline(heading[2] ?? "") });
      i += 1;
      continue;
    }

    if (UL_RE.test(line) || OL_RE.test(line)) {
      const ordered = OL_RE.test(line) && !UL_RE.test(line);
      const re = ordered ? OL_RE : UL_RE;
      const items: Inline[][] = [];
      while (i < lines.length) {
        const m = re.exec(lines[i] ?? "");
        if (m === null) break;
        items.push(parseInline(m[1] ?? ""));
        i += 1;
      }
      blocks.push(ordered ? { t: "ol", items } : { t: "ul", items });
      continue;
    }

    // Paragraph: agli khaali line, heading, list ya code tak ki lines.
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i] ?? "";
      if (l.trim() === "" || FENCE_RE.test(l) || HEADING_RE.test(l) || UL_RE.test(l) || OL_RE.test(l)) break;
      para.push(l);
      i += 1;
    }
    blocks.push({ t: "p", c: parseInline(para.join("\n")) });
  }

  return blocks;
}