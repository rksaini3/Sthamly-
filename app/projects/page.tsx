"use client";

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
        {error && <p role="alert" className="muted" style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
      </form>

      {projects === null && <p className="muted">लोड हो रहा है...</p>}
      {projects?.length === 0 && !error && <p className="muted">अभी कोई प्रोजेक्ट नहीं है।</p>}
      {projects?.map((p) => (
        <div key={p.id} className="card stack">
          <strong>{p.name}</strong>
          {p.description && <p className="muted" style={{ margin: 0 }}>{p.description}</p>}
        </div>
      ))}
    </main>
  );
}