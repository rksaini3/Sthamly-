// Sthamly AI web: category tabs aur active category ke tool cards.
// Ye composer ke bagal mein, neeche tairta hua dikhta hai (chat ki shuruaat mein).
// Card dabane par parent ko tool dete hain; parent input mein prompt daalega.

import { HOME_CATEGORIES, HOME_TOOLS, type HomeCategoryId, type HomeIconName, type HomeTool } from "../lib/homeTools";
import "./HomeWorkspace.css";

interface HomeToolPanelProps {
  active: HomeCategoryId;
  onChangeCategory: (id: HomeCategoryId) => void;
  onPickTool: (tool: HomeTool) => void;
}

function ToolIcon({ name }: { name: HomeIconName }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "chat":
      return <svg {...common}><path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.2A8 8 0 1 1 21 12z" /></svg>;
    case "image":
      return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-8 8" /></svg>;
    case "doc":
      return <svg {...common}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>;
    case "chart":
      return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
  }
}

export function HomeToolPanel({ active, onChangeCategory, onPickTool }: HomeToolPanelProps) {
  const tools = HOME_TOOLS[active];

  return (
    <section className="htp" aria-label="टूल">
      <div className="htp-tabs" role="tablist" aria-label="श्रेणियाँ">
        {HOME_CATEGORIES.map((cat) => {
          const selected = cat.id === active;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={selected ? "htp-tab htp-tab-active" : "htp-tab"}
              onClick={() => onChangeCategory(cat.id)}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      <div className="htp-grid" role="list">
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            role="listitem"
            className="htp-card"
            onClick={() => onPickTool(tool)}
          >
            <span className="htp-card-icon"><ToolIcon name={tool.icon} /></span>
            <span className="htp-card-title">{tool.title}</span>
            <span className="htp-card-hint">{tool.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}