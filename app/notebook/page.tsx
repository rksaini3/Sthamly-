import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NotebookAutoToggle } from "@/components/library/NotebookAutoToggle";
import { NotebookExportButton } from "@/components/library/NotebookExportButton";
import { NotebookNotes } from "@/components/library/NotebookNotes";
import { NotebookWordButton } from "@/components/library/NotebookWordButton";
import { LANG_COOKIE, parseLang } from "@/lib/i18n";
import { LABELS } from "@/lib/labels";
import { isRole } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// नोटबुक: सिर्फ़ नोट (चैट के जवाब और हाथ से लिखे नोट), हर role के लिए।
// पोस्टर यहां नहीं दिखते; वे अपनी जगह पर ही रहते हैं।
export default async function NotebookPage() {
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  const t = LABELS[lang].notes;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/notebook");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!isRole(profile?.role)) redirect("/role");

  return (
    <main className="page stack">
      <h1 style={{ margin: 0 }}>{t.title}</h1>
      <p className="muted" style={{ margin: 0 }}>
        {t.sub}
      </p>

      <NotebookAutoToggle />

      {/* चैट के जवाब और हाथ से लिखे नोट */}
      <NotebookNotes lang={lang} />

      {/* डाउनलोड: CSV (Excel के लिए), Word (पढ़ने के लिए), और PDF (प्रिंट पन्ने से) */}
      <NotebookExportButton />
      <NotebookWordButton />

      <section className="card" style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gap: 2 }}>
          <strong style={{ fontSize: 15 }}>PDF में सेव करें</strong>
          <span className="muted" style={{ fontSize: 13 }}>
            प्रिंट पन्ना खुलेगा। वहां "PDF के लिए प्रिंट करें" दबाकर "Save as PDF" चुनें।
          </span>
        </div>
        <div>
          <Link href="/notebook/print" className="btn btn-block">
            प्रिंट पन्ना खोलें
          </Link>
        </div>
      </section>
    </main>
  );
}