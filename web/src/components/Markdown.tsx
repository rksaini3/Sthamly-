// Sthamly AI web: jawab ka markdown text React elements mein dikhata hai.
// dangerouslySetInnerHTML kabhi nahi. Links sirf http/https, aur naye tab mein.

import type { ReactNode } from "react";
import { parseMarkdown, type Block, type Inline } from "../lib/markdown";
import "./Markdown.css";

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text":
        return n.v;
      case "b":
        return <strong key={i}>{renderInline(n.c)}</strong>;
      case "i":
        return <em key={i}>{renderInline(n.c)}</em>;
      case "code":
        return (
          <code key={i} className="md-code">
            {n.v}
          </code>
        );
      case "a":
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
            {renderInline(n.c)}
          </a>
        );
    }
  });
}

function renderBlock(b: Block, i: number): ReactNode {
  switch (b.t) {
    case "p":
      return <p key={i}>{renderInline(b.c)}</p>;
    case "h":
      return (
        <p key={i} className={`md-heading md-h${b.level}`}>
          {renderInline(b.c)}
        </p>
      );
    case "ul":
      return (
        <ul key={i}>
          {b.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={i}>
          {b.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ol>
      );
    case "code":
      return (
        <pre key={i} className="md-pre">
          <code>{b.v}</code>
        </pre>
      );
  }
}

export function Markdown({ text }: { text: string }) {
  return <div className="md">{parseMarkdown(text).map(renderBlock)}</div>;
}