import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PrintButton } from "@/components/library/PrintButton";
import { formatDate } from "@/lib/format";
import { LANG_COOKIE, parseLang } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// print के लिए सीमा (एक पन्ने पर बहुत सारे नोट हों तो भी पेज भारी न हो)
const MAX_NOTES = 300;

const KIND_HI: Record<"chat" | "poster" | "manual", string> = {
  chat: "चैट से",
  poster: "पोस्टर",
  manual: "हाथ से लिखा",
};

// print के समय बटन छुपाना और हर नोट को पन्ने के बीच में टूटने से बचाना
const PRINT_CSS = `
  .print-page { max-width: 760px; margin: 0 auto; padding: 24px 20px 48px; color: #1B1A17;
    font-family: "Nirmala UI", "Noto Sans Devanagari", "Segoe UI", system-ui, sans-serif; line-height: 1.7; }
  .print-page h1 { font-size: 26px; margin: 0 0 4px; }
  .print-page .meta { color: #6B6B6B; font-size: 13px; margin: 0 0 20px; }
  .print-page .note { border-top: 1px solid #e5e5e5; padding: 16px 0; break-inside: avoid; page-break-inside: avoid; }
  .print-page .note h2 { font-size: 18px; margin: 0 0 4px; }
  .print-page .note .sub { color: #6B6B6B; font-size: 12px; margin: 0 0 8px; }
  .print-page .note .q { font-size: 14px; margin: 0 0 8px; color: #3d3b36; }
  .print-page .note .body { font-size: 15px; white-space: pre-wrap; margin: 0; }
  .print-page .note .tags { font-size: 12px; color: #6B6B6B; margin: 8px 0 0; }
  .print-page .empty { color: #6B6B6B; font-size: 15px; }
  .print-bar { display: flex; justify-content: flex-end; margin-bottom: 16px; }
  @media print {
    .print-bar { display: none !important; }
    .print-page { padding: 0; max-width: none; }
    body { background: #fff !important; }
  }
`;

export default async function NotebookPrintPage() {
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/notebook/print");

  // RLS से सिर्फ़ अपने नोट, पिन वाले पहले, फिर सबसे नए बदले हुए
  const { data, error } = await supabase
    .from("notebook_notes")
    .select("id, kind, title, question, content, tags, pinned, updated_at")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(MAX_NOTES);

  if (error) console.error("notebook print: read failed", error);
  const notes = error ? [] : (data ?? []);

  const today = formatDate(new Date().toISOString(), lang);

  return (
    <main className="print-page">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="print-bar">
        <PrintButton />
      </div>

      <h1>Sthamly नोटबुक</h1>
      <p className="meta">
        बनाया गया: {today} · कुल नोट: {notes.length}
      </p>

      {notes.length === 0 && <p className="empty">अभी कोई नोट नहीं है।</p>}

      {notes.map((note, i) => (
        <article key={note.id} className="note">
          <h2>
            {i + 1}. {note.pinned ? "📌 " : ""}
            {note.title}
          </h2>
          <p className="sub">
            {KIND_HI[note.kind as "chat" | "poster" | "manual"] ?? note.kind} · {formatDate(note.updated_at, lang)}
          </p>
          {note.question && note.question.trim() && <p className="q">सवाल: {note.question}</p>}
          <p className="body">{note.content}</p>
          {note.tags.length > 0 && <p className="tags">टैग: {note.tags.map((t) => `#${t}`).join("  ")}</p>}
        </article>
      ))}
    </main>
  );
}