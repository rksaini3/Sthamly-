import Link from "next/link";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/dashboard/AutoRefresh";
import { OutputCard } from "@/components/dashboard/OutputCard";
import { Card } from "@/components/ui/Card";
import { formatDate } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { JobStatus, OutputType } from "@/types/domain";

// हर बार ताज़ा डेटा, ताकि job की status अपडेट दिखे
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "कतार में",
  running: "बन रहा है…",
  done: "तैयार",
  failed: "नहीं बन पाया",
};

interface OutputRow {
  id: string;
  type: OutputType;
  storage_path: string | null;
  content: string | null;
  watermarked: boolean;
}

interface JobRow {
  id: string;
  status: JobStatus;
  error: string | null;
  created_at: string;
  outputs: OutputRow[];
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");

  // RLS की वजह से सिर्फ इसी यूज़र की दुकानों के jobs आएंगे
  const { data, error } = await supabase
    .from("jobs")
    .select("id, status, error, created_at, outputs(id, type, storage_path, content, watermarked)")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("dashboard: jobs read failed", error);
    return (
      <main className="page stack">
        <h1>आपके आउटपुट</h1>
        <p className="alert alert-error">डेटा नहीं मिल पाया। पेज दोबारा खोलें।</p>
      </main>
    );
  }

  const jobs = (data ?? []) as unknown as JobRow[];

  // हर poster की signed URL (यूज़र की अपनी session से, storage policy के अंदर)
  const rows = await Promise.all(
    jobs.map(async (job) => ({
      job,
      outputs: await Promise.all(
        job.outputs.map(async (output) => {
          let url: string | null = null;
          if (output.type === "poster" && output.storage_path) {
            const { data: signed } = await supabase.storage
              .from("outputs")
              .createSignedUrl(output.storage_path, 60 * 60);
            url = signed?.signedUrl ?? null;
          }
          return { ...output, url };
        }),
      ),
    })),
  );

  const hasActive = rows.some(({ job }) => job.status === "queued" || job.status === "running");

  return (
    <main className="page stack">
      <AutoRefresh active={hasActive} />

      <header className="row">
        <div>
          <p className="brand">Sthamly</p>
          <h1>आपके आउटपुट</h1>
        </div>
        <Link href="/onboarding" className="btn btn-primary">
          नया पोस्टर
        </Link>
      </header>

      {rows.length === 0 && (
        <Card>
          <p className="muted">
            अभी कोई आउटपुट नहीं है। <Link href="/onboarding">पहला पोस्टर बनवाएं</Link>।
          </p>
        </Card>
      )}

      {rows.map(({ job, outputs }) => (
        <Card key={job.id}>
          <div className="row">
            <span className="job-status">{STATUS_LABEL[job.status]}</span>
            <span className="job-date">{formatDate(job.created_at)}</span>
          </div>

          {job.status === "failed" && (
            <p className="alert alert-error" style={{ marginTop: 12 }}>
              इस बार बन नहीं पाया। आपका credit वापस कर दिया गया है।
            </p>
          )}

          {job.status !== "done" && job.status !== "failed" && (
            <p className="muted" style={{ marginTop: 8 }}>
              कुछ मिनट लग सकते हैं। यह पेज अपने-आप ताज़ा होगा।
            </p>
          )}

          {outputs.map((output) => (
            <OutputCard
              key={output.id}
              type={output.type}
              url={output.url}
              content={output.content}
              watermarked={output.watermarked}
            />
          ))}
        </Card>
      ))}
    </main>
  );
}