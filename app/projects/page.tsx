"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

interface Project {
  id: string;
  name: string;
  description: string | null;
  updated_at: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // कौन सा project एडिट हो रहा है और उसका नया मान
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  // किस project पर सेव या हटाने का काम चल रहा है
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/projects", { cache: "no-store" });
    if (!res.ok) {
      setError(res.status === 401 ? "पहले लॉग-इन करें" : "प्रोजेक्ट नहीं मिले");
      setProjects([]);
      return;
    }
    const data = (await res.json()) as { projects: Project[] };
    setProjects(data.projects);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, description: description.trim() || undefined }),
      });
      if (!res.ok) throw new Error("create failed");
      setName("");
      setDescription("");
      await load();
    } catch {
      setError("प्रोजेक्ट नहीं बन पाया, दोबारा कोशिश करें");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(p: Project) {
    setError(null);
    setEditingId(p.id);
    setEditName(p.name);
    setEditDescription(p.description ?? "");
  }

  async function saveEdit(e: FormEvent, id: string) {
    e.preventDefault();
    const trimmed = editName.trim();
    if (!trimmed) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, description: editDescription.trim() || null }),
      });
      if (!res.ok) throw new Error("update failed");
      setEditingId(null);
      await load();
    } catch {
      setError("प्रोजेक्ट नहीं बदल पाया, दोबारा कोशिश करें");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(p: Project) {
    if (!window.confirm(`"${p.name}" प्रोजेक्ट हटाएं? इसकी chats नहीं हटेंगी।`)) return;
    setBusyId(p.id);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      await load();
    } catch {
      setError("प्रोजेक्ट नहीं हट पाया, दोबारा कोशिश करें");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="page stack">
      <h1 style={{ margin: 0 }}>प्रोजेक्ट</h1>

      <form className="card stack" onSubmit={onCreate}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="प्रोजेक्ट का नाम (जैसे: दिवाली ऑफ़र)"
          maxLength={60}
          aria-label="प्रोजेक्ट का नाम"
          required
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="छोटा विवरण (वैकल्पिक)"
          maxLength={200}
          aria-label="विवरण"
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={saving || !name.trim()}>
          {saving ? "बन रहा है..." : "नया प्रोजेक्ट"}
        </button>
        {error && (
          <p role="alert" className="muted" style={{ color: "var(--danger)", margin: 0 }}>
            {error}
          </p>
        )}
      </form>

      {projects === null && <p className="muted">लोड हो रहा है...</p>}
      {projects?.length === 0 && !error && <p className="muted">अभी कोई प्रोजेक्ट नहीं है।</p>}

      {projects?.map((p) =>
        editingId === p.id ? (
          <form key={p.id} className="card stack" onSubmit={(e) => saveEdit(e, p.id)}>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={60}
              aria-label="प्रोजेक्ट का नाम"
              required
            />
            <input
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="छोटा विवरण (वैकल्पिक)"
              maxLength={200}
              aria-label="विवरण"
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={busyId === p.id || !editName.trim()}
              >
                {busyId === p.id ? "सेव हो रहा है..." : "सेव करें"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditingId(null)}
                disabled={busyId === p.id}
              >
                रद्द करें
              </button>
            </div>
          </form>
        ) : (
          <div key={p.id} className="card stack">
            <Link href={`/projects/${p.id}`} style={{ color: "inherit", textDecoration: "none" }}>
              <strong>{p.name}</strong>
            </Link>
            {p.description && (
              <p className="muted" style={{ margin: 0 }}>
                {p.description}
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => startEdit(p)}
                disabled={busyId !== null}
              >
                एडिट
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onDelete(p)}
                disabled={busyId !== null}
                style={{ color: "var(--danger)" }}
              >
                {busyId === p.id ? "हट रहा है..." : "हटाएं"}
              </button>
            </div>
          </div>
        ),
      )}
    </main>
  );
}