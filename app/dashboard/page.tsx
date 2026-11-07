import Link from "next/link";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/dashboard/AutoRefresh";
import { OutputCard } from "@/components/dashboard/OutputCard";
import { ShareButtons } from "@/components/dashboard/ShareButtons";
import { ComingSoon } from "@/components/roles/ComingSoon";
import { formatDate } from "@/lib/format";
import { isRole } from "@/lib/roles";
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

  // भूमिका: न चुनी हो तो पहले चुनवाएं
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = profile?.role;
  if (!isRole(role)) redirect("/role");

  // दुकानदार के अलावा बाकी भूमिकाएं अभी "जल्द आएगा" दिखाती हैं
  if (role !== "shopkeeper") {
    return (
      <main className="page stack">
        <h1 style={{ margin: 0 }}>आपका होम</h1>
        <ComingSoon role={role} />
      </main>
    );
  }

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
        <h1 style={{ margin: 0 }}>आपके पोस्टर</h1>
        <p className="alert alert-error">डेटा नहीं मिल पाया। पेज दोबारा खोलें।</p>
      </main>
    );
  }

  const jobs = (data ?? []) as unknown as JobRow[];

  // हर job का कैप्शन, और poster/reel की signed URL (1 घंटे के लिए)
  const rows = await Promise.all(
    jobs.map(async (job) => {
      const caption =
        job.outputs.find((o) => (o.type as string) === "caption")?.content ?? "";

      const outputs = await Promise.all(
        job.outputs.map(async (output) => {
          const kind = output.type as string;
          let signedUrl: string | null = null;
          if ((kind === "poster" || kind === "reel") && output.storage_path) {
            const { data: signed } = await supabase.storage
              .from("outputs")
              .createSignedUrl(output.storage_path, 60 * 60);
            signedUrl = signed?.signedUrl ?? null;
          }
          return { ...output, kind, signedUrl };
        }),
      );

      return { job, caption, outputs };
    }),
  );

  const hasActive = rows.some(
    ({ job }) => job.status === "queued" || job.status === "running",
  );

  return (
    <main className="page stack">
      <AutoRefresh active={hasActive} />

      <div className="row">
        <h1 style={{ margin: 0 }}>आपके पोस्टर</h1>
        <Link href="/onboarding" className="btn btn-primary">
          नया पोस्ट
        </Link>
      </div>

      {rows.length === 0 && (
        <div className="card stack">
          <p className="muted" style={{ margin: 0 }}>
            अभी कोई पोस्टर नहीं है।
          </p>
          <Link href="/onboarding" className="btn btn-primary btn-block">
            पहला पोस्टर बनवाएं
          </Link>
        </div>
      )}

      {rows.map(({ job, caption, outputs }) => (
        <div key={job.id} className="card">
          <div className="row">
            <strong className="job-status">{STATUS_LABEL[job.status]}</strong>
            <span className="job-date">{formatDate(job.created_at)}</span>
          </div>

          {job.status === "failed" && (
            <p className="alert alert-error" style={{ marginTop: 8 }}>
              इस बार बन नहीं पाया। आपका credit वापस कर दिया गया है।
            </p>
          )}

          {job.status !== "done" && job.status !== "failed" && (
            <p className="muted" style={{ marginTop: 8 }}>
              कुछ मिनट लग सकते हैं। पेज अपने-आप ताज़ा होता रहेगा।
            </p>
          )}

          {outputs.map((output) => (
            <div key={output.id} className="stack" style={{ gap: 10, marginTop: 14 }}>
              <OutputCard
                type={output.type}
                url={output.kind === "poster" ? output.signedUrl : null}
                content={output.content}
                watermarked={output.watermarked}
              />

              {output.signedUrl && (output.kind === "poster" || output.kind === "reel") && (
                <ShareButtons
                  url={output.signedUrl}
                  caption={caption}
                  kind={output.kind === "reel" ? "video" : "image"}
                  fileName={`sthamly-${job.id.slice(0, 8)}.${output.kind === "reel" ? "mp4" : "png"}`}
                />
              )}
            </div>
          ))}
        </div>
      ))}
    </main>
  );
}