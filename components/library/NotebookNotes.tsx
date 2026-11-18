"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { formatDate } from "@/lib/format";
import type { Lang } from "@/lib/i18n";

// /api/notebook/notes और /api/notebook/notes/[id] से आने वाला नोट
export interface NotebookNote {
  id: string;
  kind: "chat" | "poster" | "manual";
  thread_id: string | null;
  title: string;
  question: string | null;
  content: string;
  tags: string[];
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

const KIND_LABEL: Record<NotebookNote["kind"], string> = {
  chat: "चैट से",
  poster: "पोस्टर",
  manual: "हाथ से लिखा",
};

const SEARCH_DEBOUNCE_MS = 300;

function errorMessage(data: unknown, fallback: string): string {
  const d = data as { error?: { message?: string } } | null;
  return d?.error?.message ?? fallback;
}

export function NotebookNotes({ lang = "hi" }: { lang?: Lang }) {
  const [notes, setNotes] = useState<NotebookNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const requestSeq = useRef(0);

  // खोज को थोड़ा रुककर भेजें, ताकि हर अक्षर पर सर्वर को न जाना पड़े
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const loadNotes = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (tagFilter) params.set("tag", tagFilter);
      const res = await fetch(`/api/notebook/notes?${params.toString()}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { notes?: NotebookNote[] } | null;
      if (seq !== requestSeq.current) return; // पुराना जवाब, नज़रअंदाज़
      if (!res.ok) {
        setError(errorMessage(data, "नोट्स नहीं खुल पाए"));
        return;
      }
      setNotes(data?.notes ?? []);
    } catch {
      if (seq === requestSeq.current) setError("इंटरनेट की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [debouncedQuery, tagFilter]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  // सभी tags, बिना दोहराव, छोटे अक्षरों में (फ़िल्टर के चिप्स के लिए)
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) for (const t of n.tags) set.add(t);
    return [...set].sort();
  }, [notes]);

  // ---- बदलाव: सर्वर पर भेजें, फिर सूची में वही नोट बदलें ----

  function replaceNote(updated: NotebookNote) {
    setNotes((list) => list.map((n) => (n.id === updated.id ? updated : n)));
  }

  async function togglePin(note: NotebookNote) {
    setError(null);
    setBusyId(note.id);
    try {
      const res = await fetch(`/api/notebook/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !note.pinned }),
      });
      const data = (await res.json().catch(() => null)) as { note?: NotebookNote } | null;
      if (!res.ok || !data?.note) {
        setError(errorMessage(data, "पिन नहीं हो पाया"));
        return;
      }
      // pin बदलने पर क्रम भी बदलता है, इसलिए दोबारा लोड
      void loadNotes();
    } catch {
      setError("इंटरनेट की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusyId(null);
    }
  }

  async function removeNote(note: NotebookNote) {
    if (!window.confirm(`"${note.title}" नोटबुक से हट जाएगा। चैट पर कोई असर नहीं होगा। हटाएं?`)) return;
    setError(null);
    setBusyId(note.id);
    try {
      const res = await fetch(`/api/notebook/notes/${note.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (!res.ok || !data?.ok) {
        setError(errorMessage(data, "नोट हट नहीं पाया"));
        return;
      }
      setNotes((list) => list.filter((n) => n.id !== note.id));
      if (openId === note.id) setOpenId(null);
      if (editingId === note.id) setEditingId(null);
    } catch {
      setError("इंटरनेट की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusyId(null);
    }
  }

  // ---- दिखावट ----

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="नोट्स में खोजें…"
          aria-label="नोट्स में खोजें"
          maxLength={200}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button type="button" className="btn btn-primary" onClick={() => setCreating((v) => !v)}>
          {creating ? "बंद करें" : "नया नोट"}
        </button>
      </div>

      {allTags.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setTagFilter(null)}
            style={chipStyle(tagFilter === null)}
          >
            सभी
          </button>
          {allTags.map((t) => (
            <button key={t} type="button" onClick={() => setTagFilter(t)} style={chipStyle(tagFilter === t)}>
              #{t}
            </button>
          ))}
        </div>
      )}

      {creating && (
        <NewNoteForm
          onCreated={(note) => {
            setCreating(false);
            setNotes((list) => [note, ...list]);
          }}
        />
      )}

      {error && (
        <p role="alert" style={{ margin: 0, color: "var(--danger)", fontSize: 14 }}>
          {error}
        </p>
      )}

      {loading && notes.length === 0 && <p className="muted" style={{ margin: 0 }}>नोट्स लोड हो रहे हैं…</p>}

      {!loading && notes.length === 0 && !error && (
        <div className="card" style={{ display: "grid", gap: 6 }}>
          <strong>अभी कोई नोट नहीं है</strong>
          <span className="muted" style={{ fontSize: 14 }}>
            चैट में सवाल पूछिए। जवाब अपने आप यहां आएगा, या ऊपर "नया नोट" से खुद लिखिए।
          </span>
        </div>
      )}

      {notes.map((note) => {
        const isOpen = openId === note.id;
        const isEditing = editingId === note.id;
        const busy = busyId === note.id;
        return (
          <article key={note.id} className="card" style={{ display: "grid", gap: 8 }}>
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : note.id)}
              aria-expanded={isOpen}
              style={titleButtonStyle}
            >
              <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {note.pinned && <span aria-label="पिन किया हुआ">📌</span>}
                <strong style={{ fontSize: 16, textAlign: "left" }}>{note.title}</strong>
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                {KIND_LABEL[note.kind]} · {formatDate(note.updated_at, lang)}
              </span>
            </button>

            {note.tags.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {note.tags.map((t) => (
                  <span key={t} style={tagStyle}>
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {isOpen && !isEditing && (
              <div style={{ display: "grid", gap: 8 }}>
                {note.question && (
                  <p style={{ margin: 0, fontSize: 14, color: "var(--muted, #57534e)" }}>
                    <strong>सवाल: </strong>
                    {note.question}
                  </p>
                )}
                <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 15, lineHeight: 1.6 }}>{note.content}</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => setEditingId(note.id)}
                  >
                    बदलें
                  </button>
                  <button type="button" className="btn" disabled={busy} onClick={() => togglePin(note)}>
                    {note.pinned ? "पिन हटाएं" : "पिन करें"}
                  </button>
                  <button type="button" className="btn" disabled={busy} onClick={() => removeNote(note)}>
                    हटाएं
                  </button>
                </div>
              </div>
            )}

            {isOpen && isEditing && (
              <NoteEditor
                note={note}
                onCancel={() => setEditingId(null)}
                onSaved={(updated) => {
                  replaceNote(updated);
                  setEditingId(null);
                }}
              />
            )}
          </article>
        );
      })}
    </section>
  );
}

// ---- हाथ से नया नोट ----

function NewNoteForm({ onCreated }: { onCreated: (note: NotebookNote) => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (content.trim().length === 0) {
      setError("नोट में कुछ लिखें");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/notebook/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "manual",
          title: title.trim() || undefined,
          content: content.trim(),
          tags: parseTags(tags),
        }),
      });
      const data = (await res.json().catch(() => null)) as { note?: NotebookNote } | null;
      if (!res.ok || !data?.note) {
        setError(errorMessage(data, "नोट सेव नहीं हो पाया"));
        return;
      }
      onCreated(data.note);
    } catch {
      setError("इंटरनेट की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ display: "grid", gap: 8 }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="शीर्षक (खाली छोड़ें तो पहली लाइन से बनेगा)"
        maxLength={200}
        style={inputStyle}
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="यहां लिखें…"
        rows={5}
        maxLength={50000}
        style={inputStyle}
      />
      <input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="tags, कॉमा से (जैसे: पढ़ाई, कानून)"
        maxLength={200}
        style={inputStyle}
      />
      {error && <p role="alert" style={{ margin: 0, color: "var(--danger)", fontSize: 14 }}>{error}</p>}
      <div>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
          सेव करें
        </button>
      </div>
    </div>
  );
}

// ---- मौजूदा नोट बदलना ----

function NoteEditor({
  note,
  onCancel,
  onSaved,
}: {
  note: NotebookNote;
  onCancel: () => void;
  onSaved: (note: NotebookNote) => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [question, setQuestion] = useState(note.question ?? "");
  const [content, setContent] = useState(note.content);
  const [tags, setTags] = useState(note.tags.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (content.trim().length === 0) {
      setError("नोट खाली नहीं हो सकता");
      return;
    }
    if (title.trim().length === 0) {
      setError("शीर्षक खाली नहीं हो सकता");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/notebook/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          question: question.trim() ? question.trim() : null,
          content: content.trim(),
          tags: parseTags(tags),
        }),
      });
      const data = (await res.json().catch(() => null)) as { note?: NotebookNote } | null;
      if (!res.ok || !data?.note) {
        setError(errorMessage(data, "बदलाव सेव नहीं हो पाया"));
        return;
      }
      onSaved(data.note);
    } catch {
      setError("इंटरनेट की गड़बड़ी, दोबारा कोशिश करें");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} style={inputStyle} />
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="सवाल (वैकल्पिक)"
        maxLength={4000}
        style={inputStyle}
      />
      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} maxLength={50000} style={inputStyle} />
      <input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="tags, कॉमा से"
        maxLength={200}
        style={inputStyle}
      />
      {error && <p role="alert" style={{ margin: 0, color: "var(--danger)", fontSize: 14 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
          सेव करें
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          रद्द करें
        </button>
      </div>
    </div>
  );
}

// "पढ़ाई, कानून" → ["पढ़ाई", "कानून"], सर्वर पर भी साफ़ होता है
function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 10);
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--border, #d4d4d4)",
  fontSize: 15,
  font: "inherit",
  boxSizing: "border-box",
};

const titleButtonStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: 0,
  border: "none",
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
  font: "inherit",
  color: "inherit",
};

const tagStyle: CSSProperties = {
  fontSize: 12,
  padding: "2px 8px",
  borderRadius: 999,
  background: "var(--surface-2, #f5f5f4)",
};

function chipStyle(active: boolean): CSSProperties {
  return {
    fontSize: 13,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid var(--border, #d4d4d4)",
    background: active ? "var(--accent, #1B1A17)" : "transparent",
    color: active ? "#fff" : "inherit",
    cursor: "pointer",
  };
}