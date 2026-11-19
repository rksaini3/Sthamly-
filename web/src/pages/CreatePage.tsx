// Sthamly AI web: creation page (Blueprint 4.0, UI spec ke hisaab se)
// Flow: type chuno -> prompt -> plan card -> banao (progress, Stop) -> preview -> download, dobara, hatao.
// Preview: image seedha, slides aur website sandbox iframe mein (script chalegi, network aur login nahi),
// document formatted text mein. Sab Worker ke signed link se.
// Sirf login user. Guest ko login card.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  CreateApiError,
  KIND_LABELS,
  createFile,
  deleteFile,
  extensionFor,
  fetchTextFile,
  getDownloadUrl,
  listFiles,
  openDownload,
  type CreateKind,
  type CreatedFile,
} from "../api/create";

const MAX_PROMPT_CHARS = 2000;

const CHIPS: Array<{ kind: CreateKind; hint: string }> = [
  { kind: "image", hint: "दुकान का पोस्टर, उत्पाद की तस्वीर" },
  { kind: "slides", hint: "सेल या बिज़नेस का प्रेज़ेंटेशन" },
  { kind: "website", hint: "दुकान का एक पेज" },
  { kind: "document", hint: "प्राइस लिस्ट, पत्र, नोट्स" },
];

// Progress ke saaf steps (asli kaam Worker karta hai, ye sirf dikhane ke liye).
const PROGRESS_STEPS: Record<CreateKind, string[]> = {
  image: ["विवरण समझ रहा हूँ…", "तस्वीर बना रहा हूँ…", "तैयार कर रहा हूँ…"],
  slides: ["ढाँचा बना रहा हूँ…", "स्लाइड लिख रहा हूँ…", "तस्वीरें जोड़ रहा हूँ…", "तैयार कर रहा हूँ…"],
  website: ["पेज का ढाँचा बना रहा हूँ…", "डिज़ाइन लिख रहा हूँ…", "तैयार कर रहा हूँ…"],
  document: ["विषय समझ रहा हूँ…", "लिख रहा हूँ…", "तैयार कर रहा हूँ…"],
};

// Plan card: banane se pehle saaf jaankari.
function planSummary(kind: CreateKind, prompt: string): string[] {
  const short = Array.from(prompt.trim()).slice(0, 80).join("");
  if (kind === "image") {
    return [`विषय: ${short}`, "आउटपुट: एक तस्वीर (PNG)", "कुछ सेकंड लगेंगे"];
  }
  if (kind === "slides") {
    return [
      `विषय: ${short}`,
      "आउटपुट: प्रेज़ेंटेशन (HTML, डाउनलोड करें)",
      "स्लाइड संख्या AI तय करेगा",
    ];
  }
  if (kind === "website") {
    return [`विषय: ${short}`, "आउटपुट: एक HTML पेज, पहले पूर्वावलोकन", "एक मिनट तक लग सकता है"];
  }
  return [`विषय: ${short}`, "आउटपुट: दस्तावेज़ (Markdown)", "कुछ सेकंड लगेंगे"];
}

function errorText(err: unknown): string {
  if (err instanceof CreateApiError) return err.message;
  return "कुछ गड़बड़ हो गई। दोबारा कोशिश करें।";
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileCard({
  file,
  active,
  onOpen,
}: {
  file: CreatedFile;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <li className={active ? "conv-item active" : "conv-item"}>
      <button type="button" className="conv-open" onClick={onOpen}>
        <span className="small muted">{KIND_LABELS[file.kind]}</span>
        <br />
        {file.title}
      </button>
    </li>
  );
}

// Preview: type ke hisaab se. Token parent se aata hai.
function Preview({ file, token }: { file: CreatedFile; token: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setHtml(null);
    setText(null);
    setImageUrl(null);

    (async () => {
      try {
        const url = await getDownloadUrl(token, file.id, ctrl.signal);
        if (ctrl.signal.aborted) return;

        if (file.kind === "image") {
          setImageUrl(url);
        } else if (file.kind === "document") {
          setText(await fetchTextFile(url, ctrl.signal));
        } else {
          setHtml(await fetchTextFile(url, ctrl.signal));
        }
      } catch (err) {
        if (isAbort(err)) return;
        setError(errorText(err));
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    })();

    return () => ctrl.abort();
  }, [file.id, file.kind, token]);

  if (loading) return <p className="muted">पूर्वावलोकन लोड हो रहा है…</p>;
  if (error !== null) return <p className="chat-error">{error}</p>;

  if (imageUrl !== null) {
    return (
      <img
        src={imageUrl}
        alt={file.title}
        style={{ maxWidth: "100%", borderRadius: 12 }}
      />
    );
  }

  if (text !== null) {
    // Markdown ko text ke roop mein dikhate hain, HTML ki tarah nahi (safe).
    return (
      <pre className="bubble-text" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
        {text}
      </pre>
    );
  }

  if (html !== null) {
    // sandbox: koi same-origin access nahi, koi cookies nahi, koi form nahi.
    // allow-scripts se page ka JS chal sakta hai, lekin network aur login ka access nahi.
    return (
      <iframe
        title={file.title}
        sandbox="allow-scripts"
        srcDoc={html}
        style={{
          width: "100%",
          minHeight: "70vh",
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "#ffffff",
        }}
      />
    );
  }

  return null;
}

export function CreatePage() {
  const { status, getAccessToken } = useAuth();

  const isMember = status === "signed_in";
  const isGuest = status === "signed_out";

  const [token, setToken] = useState<string>("");
  const [kind, setKind] = useState<CreateKind>("image");
  const [prompt, setPrompt] = useState("");
  const [stage, setStage] = useState<"compose" | "plan" | "working" | "done">("compose");
  const [progressIndex, setProgressIndex] = useState(0);
  const [files, setFiles] = useState<CreatedFile[]>([]);
  const [activeFile, setActiveFile] = useState<CreatedFile | null>(null);
  const [downloadedHint, setDownloadedHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // Login user ka token, ek baar. Logout par khaali.
  useEffect(() => {
    if (!isMember) {
      setToken("");
      return;
    }
    let active = true;
    getAccessToken()
      .then((t) => {
        if (active) setToken(t ?? "");
      })
      .catch(() => {
        if (active) setToken("");
      });
    return () => {
      active = false;
    };
  }, [isMember, getAccessToken]);

  // Login user ki files ki list.
  useEffect(() => {
    if (!isMember) {
      setFiles([]);
      return;
    }
    const ctrl = new AbortController();
    (async () => {
      try {
        const t = await getAccessToken();
        if (!t || ctrl.signal.aborted) return;
        const res = await listFiles(t, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setFiles(res.files);
      } catch (err) {
        if (isAbort(err)) return;
        setError(errorText(err));
      }
    })();
    return () => ctrl.abort();
  }, [isMember, getAccessToken]);

  // Progress: sirf dikhane ke liye.
  useEffect(() => {
    if (stage !== "working") return;
    const steps = PROGRESS_STEPS[kind].length;
    const id = setInterval(() => {
      setProgressIndex((i) => (i + 1 < steps ? i + 1 : i));
    }, 2500);
    return () => clearInterval(id);
  }, [stage, kind]);

  // Screen band hone par chalti request bhi band.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const cleanPrompt = prompt.trim();
  const canPlan =
    isMember && cleanPrompt.length > 0 && cleanPrompt.length <= MAX_PROMPT_CHARS && !busy;

  function handleChip(next: CreateKind): void {
    setKind(next);
    setError(null);
    setStage("compose");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canPlan) return;
    setError(null);
    setStage("plan");
  }

  async function handleCreate(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    setStage("working");
    setProgressIndex(0);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const t = await getAccessToken();
      if (!t) {
        throw new CreateApiError("unauthenticated", "बनाने के लिए पहले लॉग-इन करें।", false);
      }
      // Har attempt ka naya key. Busy flag double tap ko rokta hai.
      const res = await createFile(
        t,
        { kind, prompt: cleanPrompt, idempotencyKey: crypto.randomUUID() },
        ctrl.signal,
      );
      setFiles((prev) => [res.file, ...prev]);
      setActiveFile(res.file);
      setStage("done");
    } catch (err) {
      if (isAbort(err)) {
        setStage("plan");
        return;
      }
      setError(errorText(err));
      setStage("plan");
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function handleStop(): void {
    abortRef.current?.abort();
  }

  async function handleDownload(file: CreatedFile): Promise<void> {
    try {
      const t = await getAccessToken();
      if (!t) throw new CreateApiError("unauthenticated", "पहले लॉग-इन करें।", false);
      const name = `${file.title}.${extensionFor(file.kind, file.mime_type)}`;
      await openDownload(t, file.id, name);
      setDownloadedHint("डाउनलोड शुरू हो गया।");
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function handleDelete(file: CreatedFile): Promise<void> {
    if (!window.confirm("यह फ़ाइल हमेशा के लिए हट जाएगी। पक्का?")) return;
    try {
      const t = await getAccessToken();
      if (!t) throw new CreateApiError("unauthenticated", "पहले लॉग-इन करें।", false);
      await deleteFile(t, file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      if (activeFile?.id === file.id) {
        setActiveFile(null);
        setStage("compose");
      }
    } catch (err) {
      setError(errorText(err));
    }
  }

  function handleNew(): void {
    setActiveFile(null);
    setPrompt("");
    setStage("compose");
    setError(null);
    setDownloadedHint(null);
  }

  function openFile(file: CreatedFile): void {
    setActiveFile(file);
    setStage("done");
    setError(null);
    setDownloadedHint(null);
  }

  return (
    <div className="chat-layout">
      <aside className="chat-sidebar" aria-label="मेरी फ़ाइलें">
        <div className="sidebar-top">
          <button type="button" className="btn-primary" onClick={handleNew} disabled={!isMember}>
            + नया बनाएँ
          </button>
        </div>

        {isMember ? (
          files.length === 0 ? (
            <p className="muted small">अभी कोई फ़ाइल नहीं बनी।</p>
          ) : (
            <ul className="conv-list">
              {files.map((f) => (
                <FileCard
                  key={f.id}
                  file={f}
                  active={activeFile?.id === f.id}
                  onOpen={() => openFile(f)}
                />
              ))}
            </ul>
          )
        ) : (
          <p className="muted small">बनाने के लिए लॉग-इन करें।</p>
        )}

        <nav className="sidebar-nav">
          <Link to="/chat">चैट पर वापस</Link>
          {isMember ? (
            <Link to="/settings">सेटिंग्स</Link>
          ) : (
            <Link to="/login">लॉग-इन करें</Link>
          )}
        </nav>
      </aside>

      <main className="chat-main">
        <header className="chat-header">
          <h1 className="chat-title">बनाएँ</h1>
        </header>

        <section className="chat-messages" aria-live="polite">
          {isGuest && (
            <section className="card" style={{ margin: "0 auto", maxWidth: 560 }}>
              <h2>बनाने के लिए लॉग-इन करें</h2>
              <p className="muted small">
                तस्वीर, प्रेज़ेंटेशन, वेबसाइट और दस्तावेज़ बनाना लॉग-इन के बाद खुलता है। आपकी फ़ाइलें भी वहीं सेव रहेंगी।
              </p>
              <Link
                to="/login"
                className="btn-primary"
                style={{ textDecoration: "none", alignSelf: "flex-start" }}
              >
                लॉग-इन करें
              </Link>
            </section>
          )}

          {isMember && stage === "compose" && (
            <div className="empty-state">
              <h2>आज क्या बनाएँ?</h2>
              <p>नीचे चुनें, फिर बताएँ कि क्या चाहिए।</p>
            </div>
          )}

          {isMember && stage === "plan" && (
            <section className="card" style={{ margin: "0 auto", maxWidth: 560 }} aria-label="योजना">
              <h2>योजना देखें</h2>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
                {planSummary(kind, cleanPrompt).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void handleCreate()}
                  disabled={busy}
                >
                  हाँ, बनाओ
                </button>
                <button type="button" className="btn-ghost" onClick={() => setStage("compose")}>
                  बदलो
                </button>
              </div>
            </section>
          )}

          {isMember && stage === "working" && (
            <section className="card" style={{ margin: "0 auto", maxWidth: 560 }} aria-label="प्रगति">
              <h2>{KIND_LABELS[kind]} बन रहा है</h2>
              <p className="muted">{PROGRESS_STEPS[kind][progressIndex]}</p>
              <div className="progress" aria-hidden="true">
                <div
                  className="progress-fill"
                  style={{
                    width: `${Math.round(((progressIndex + 1) / PROGRESS_STEPS[kind].length) * 100)}%`,
                  }}
                />
              </div>
              <button
                type="button"
                className="btn-stop"
                onClick={handleStop}
                style={{ alignSelf: "flex-start" }}
              >
                रोकें
              </button>
            </section>
          )}

          {isMember && stage === "done" && activeFile !== null && token !== "" && (
            <section className="card" style={{ margin: "0 auto", maxWidth: 720 }} aria-label="पूर्वावलोकन">
              <div>
                <h2>{activeFile.title}</h2>
                <p className="muted small">
                  {KIND_LABELS[activeFile.kind]} {formatSize(activeFile.size_bytes)}
                </p>
              </div>

              <Preview file={activeFile} token={token} />

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void handleDownload(activeFile)}
                >
                  डाउनलोड करें
                </button>
                <button type="button" className="btn-ghost" onClick={handleNew}>
                  नया बनाएँ
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => void handleDelete(activeFile)}
                >
                  हटाएँ
                </button>
              </div>
              {downloadedHint !== null && <p className="muted small">{downloadedHint}</p>}
            </section>
          )}
        </section>

        {error !== null && (
          <p className="chat-error" role="alert">
            {error}
          </p>
        )}

        {isMember && stage === "compose" && (
          <>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                padding: "0 16px 8px",
                maxWidth: 720,
                margin: "0 auto",
                width: "100%",
              }}
            >
              {CHIPS.map((chip) => (
                <button
                  key={chip.kind}
                  type="button"
                  className={chip.kind === kind ? "btn-primary" : "btn-ghost"}
                  onClick={() => handleChip(chip.kind)}
                  title={chip.hint}
                >
                  {KIND_LABELS[chip.kind]}
                </button>
              ))}
            </div>

            <form className="composer" onSubmit={handleSubmit}>
              <textarea
                rows={1}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={CHIPS.find((c) => c.kind === kind)?.hint ?? ""}
                maxLength={MAX_PROMPT_CHARS}
                aria-label="विवरण"
              />
              <button type="submit" className="btn-primary" disabled={!canPlan}>
                आगे
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}