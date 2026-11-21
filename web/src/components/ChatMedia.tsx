// Sthamly AI web: chat ke bubble mein tasveer aur PDF dikhane wale chhote hisse.
// AiImageBlock: AI ki bani tasveer, uske neeche "एडिट करें" aur "बैकग्राउंड हटाएँ".
// UserAttachment: user ne jo tasveer ya PDF bheji, wo sandesh ke upar dikhti hai.

import type { ReactNode } from "react";
import "./ChatMedia.css";

export interface MessageAttachment {
  kind: "image" | "pdf";
  name: string;
  previewUrl?: string;
}

interface AiImageBlockProps {
  src: string;
  disabled: boolean;
  onOpen: (src: string) => void;
  onEdit: (src: string) => void;
  onRemoveBackground: (src: string) => void;
}

export function AiImageBlock({ src, disabled, onOpen, onEdit, onRemoveBackground }: AiImageBlockProps) {
  return (
    <div className="chat-media">
      <button
        type="button"
        className="chat-media-open"
        onClick={() => onOpen(src)}
        aria-label="तस्वीर बड़ी करके देखें"
      >
        <img src={src} alt="AI की बनाई तस्वीर" />
      </button>
      <div className="msg-actions" role="group" aria-label="तस्वीर के विकल्प">
        <button type="button" className="msg-action" onClick={() => onEdit(src)} disabled={disabled}>
          एडिट करें
        </button>
        <button
          type="button"
          className="msg-action"
          onClick={() => onRemoveBackground(src)}
          disabled={disabled}
        >
          बैकग्राउंड हटाएँ
        </button>
      </div>
    </div>
  );
}

interface UserAttachmentProps {
  attachment: MessageAttachment;
}

export function UserAttachment({ attachment }: UserAttachmentProps): ReactNode {
  if (attachment.kind === "image" && attachment.previewUrl) {
    return (
      <div className="chat-media chat-media-user">
        <img src={attachment.previewUrl} alt={attachment.name} />
      </div>
    );
  }
  return (
    <div className="chat-media chat-media-user chat-media-doc">
      <span className="chat-media-badge" aria-hidden="true">
        PDF
      </span>
      <span className="chat-media-name">{attachment.name}</span>
    </div>
  );
}