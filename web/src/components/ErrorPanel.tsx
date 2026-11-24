// Sthamly AI web: saaf error panel. Title + vakya + agla kadam. Technical text kabhi nahi.
// Mic ki anumati wali dikkat par chitra ke saath steps (text bhi saath, sirf rang par nirbhar nahi).

import type { FriendlyError } from "../lib/friendlyError";

interface ErrorPanelProps {
  info: FriendlyError;
  onRetry?: () => void;
  onLogin?: () => void;
  onTypeInstead?: () => void;
  onDismiss: () => void;
}

export function ErrorPanel({ info, onRetry, onLogin, onTypeInstead, onDismiss }: ErrorPanelProps) {
  return (
    <div className={`chat-error chat-error-row error-panel error-${info.kind}`} role="alert" style={{ margin: "0 16px 8px" }}>
      <div className="chat-error-body">
        <p className="error-title">
          <strong>{info.title}</strong>
        </p>
        <p style={{ margin: "4px 0 0" }}>{info.message}</p>

        {info.autoRetry && <p className="muted small error-note">थोड़ी देर बाद अपने-आप फिर कोशिश होगी।</p>}

        {info.showMicHelp && <MicHelp />}

        <div className="error-actions">
          {info.canRetry && onRetry && (
            <button type="button" className="btn-primary" onClick={onRetry}>
              फिर कोशिश करें
            </button>
          )}
          {info.kind === "login" && onLogin && (
            <button type="button" className="btn-primary" onClick={onLogin}>
              लॉग-इन करें
            </button>
          )}
          {info.offerTyping && onTypeInstead && (
            <button type="button" className="btn-ghost" onClick={onTypeInstead}>
              लिखकर भेजें
            </button>
          )}
        </div>
      </div>
      <button type="button" className="chat-error-close" onClick={onDismiss} aria-label="संदेश बंद करें">
        ✕
      </button>
    </div>
  );
}

// Mic kahan se chalu karein: teen kadam, ek saadaa chitra ke saath.
export function MicHelp() {
  return (
    <div className="mic-help" aria-label="माइक चालू करने के तरीके">
      <svg className="mic-help-art" viewBox="0 0 120 80" aria-hidden="true" focusable="false">
        <rect x="34" y="6" width="52" height="68" rx="9" fill="none" stroke="currentColor" strokeWidth="3" />
        <rect x="42" y="16" width="36" height="6" rx="3" fill="currentColor" opacity="0.25" />
        <rect x="42" y="26" width="36" height="6" rx="3" fill="currentColor" opacity="0.25" />
        <circle cx="60" cy="50" r="9" fill="none" stroke="currentColor" strokeWidth="3" />
        <path d="M60 59v5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <rect x="84" y="20" width="26" height="22" rx="5" fill="currentColor" />
        <text x="97" y="35" textAnchor="middle" fontSize="11" fill="var(--bg)" fontFamily="sans-serif">
          ON
        </text>
      </svg>
      <ol className="mic-help-steps">
        <li>ब्राउज़र के पते के पास ताला या सेटिंग्स का चिह्न दबाएँ।</li>
        <li>&quot;माइक्रोफ़ोन&quot; को &quot;अनुमति दें&quot; पर रखें।</li>
        <li>इस पेज पर वापस आकर माइक का बटन फिर दबाएँ।</li>
      </ol>
    </div>
  );
}