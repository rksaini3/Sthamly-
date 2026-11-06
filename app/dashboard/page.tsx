import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { OutputCard } from "@/components/dashboard/OutputCard";
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
  if (!user) redirect("/");

  // RLS की वजह से सिर्फ इसी यूज़र की दुकानों के jobs आएंगे
  const { data, error } = await supabase
    .from("jobs")
    .select("id, status, error, created_at, outputs(id, type, storage_path, content, watermarked)")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("dashboard: jobs read failed", error);
    return (
      <main style={pageStyle}>
        <h1>आपके आउटपुट</h1>
        <p style={{ color: "#b91c1c" }}>डेटा नहीं मिल पाया। पेज दोबारा खोलें।</p>
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

  return (
    <main style={pageStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>आपके आउटपुट</h1>
        <Link href="/onboarding" style={{ fontWeight: 600 }}>
          नया पोस्टर
        </Link>
      </div>

      {rows.length === 0 && (
        <p style={{ color: "var(--muted)" }}>
          अभी कोई आउटपुट नहीं है। <Link href="/onboarding">पहला पोस्टर बनवाएं</Link>।
        </p>
      )}

      {rows.map(({ job, outputs }) => (
        <Card key={job.id}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong>{STATUS_LABEL[job.status]}</strong>
            <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
              {formatDate(job.created_at)}
            </span>
          </div>

          {job.status === "failed" && (
            <p style={{ color: "#b91c1c", margin: "8px 0 0" }}>
              इस बार बन नहीं पाया। आपका credit वापस कर दिया गया है।
            </p>
          )}

          {job.status !== "done" && job.status !== "failed" && (
            <p style={{ color: "var(--muted)", margin: "8px 0 0" }}>
              कुछ मिनट लग सकते हैं। पेज दोबारा खोलकर देखें।
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

const pageStyle = { maxWidth: 480, margin: "0 auto", padding: "24px 20px" };