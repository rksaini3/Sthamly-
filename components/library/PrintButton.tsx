"use client";

import type { CSSProperties } from "react";

// PDF सेव करने के लिए: browser का print dialog खोलता है।
// वहां "Save as PDF" (या "PDF में सेव करें") चुनने पर Hindi सही दिखती है।
export function PrintButton() {
  return (
    <button type="button" className="btn btn-primary" onClick={() => window.print()} style={buttonStyle}>
      PDF के लिए प्रिंट करें
    </button>
  );
}

const buttonStyle: CSSProperties = {
  cursor: "pointer",
};