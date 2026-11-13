import Link from "next/link";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/dashboard/AutoRefresh";
import { OutputCard } from "@/components/dashboard/OutputCard";
import { ShareButtons } from "@/components/dashboard/ShareButtons";
import { PublishToggle } from "@/components/my-posters/PublishToggle";
import { ComingSoon } from "@/components/roles/ComingSoon";
import { formatDate } from "@/lib/format";
import { PLAN_LABEL, PRICE_PAISE, formatRupees } from "@/lib/pricing";
import { getQuotaStatus } from "@/lib/quota";
import { isRole } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { JobStatus, OutputType } from "@/types/domain";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "कतार में",
  running: "बन रहा है…",
  done: "तैयार",
  failed: "नहीं बन पाया",
};

const WINDOW_TEXT = { day: "आज", week: "इस हफ़्ते", month: "इस महीने" } as const;

interface OutputRow {
  id: string;
  type: OutputType;
  storage_path: string | null;
  content: string | null;
  watermarked: boolean;
  published: boolean;
}

interface JobRow {
  id: string;
  status: JobStatus;
  error: string | null;
  created_at: string;
  outputs: OutputRow[];
}

export default async function MyPostsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/my-posters");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role;
  if (!isRole(role)) redirect("/role");

  if (role !== "shopkeeper") {
    return (
      <main className="page stack">
        <h1 style={{ margin: 0 }}>मेरे बनाए</h1>
        <ComingSoon role={role} />
      </main>
    );
  }

  // कोटा और वॉलेट वही स्रोत जो असिस्टेंट की चिप और बनाने का नियम इस्तेमाल करते हैं
  const status = await getQuotaStatus(user.id).catch((error) => {
    console.error("my-posters: quota status failed", error);
    return null;
  });

  const { data, error } = await supabase
    .from("jobs")
    .select("id, status, error, created_at, outputs(id, type, storage_path, content, watermarked, published)")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("my-posters: jobs read failed", error);
  }

  const jobs = (error ? [] : (data ?? [])) as unknown as JobRow[];

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

      <h1 style={{ margin: 0 }}>मेरे बनाए</h1>

      {/* कोटा, वॉलेट और नियम */}
      {status && (
        <div className="card stack" style={{ gap: 6 }}>
          <strong>{PLAN_LABEL[status.plan]} प्लान</strong>
          <p className="muted" style={{ margin: 0 }}>
            {WINDOW_TEXT[status.posterWindow]} पोस्टर {status.posterLeft} बचे।
            वॉलेट: {formatRupees(status.walletPaise)}
          </p>
          <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
            कोटा खत्म होने पर पोस्टर {formatRupees(PRICE_PAISE.ai_poster)} वॉलेट से कटेगा।
          </p>
          <Link href="/pricing" className="btn btn-primary btn-block">
            वॉलेट में पैसे डालें
          </Link>
        </div>
      )}

      {rows.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            अभी कोई पोस्टर या रील नहीं बना है। Sthamly से नया काम शुरू करें।
          </p>
        </div>
      )}

      {/* बने हुए पोस्टर और रील */}
      {rows.map(({ job, caption, outputs }) => (
        <div key={job.id} className="card">
          <div className="row">
            <strong className="job-status">{STATUS_LABEL[job.status]}</strong>
            <span className="job-date">{formatDate(job.created_at)}</span>
          </div>

          {job.status === "failed" && (
            <p className="alert alert-error" style={{ marginTop: 8 }}>
              इस बार बन नहीं पाया। कोटा या वॉलेट का पैसा वापस कर दिया गया है।
            </p>
          )}

          {job.status !== "done" && job.status !== "failed" && (
            <p className="muted" style={{ marginTop: 8 }}>
              कुछ मिनट लग सकते हैं। पेज अपने-आप ताज़ा होता रहेगा।
            </p>
          )}

          {outputs.map((output) => {
            const isMedia = output.kind === "poster" || output.kind === "reel";
            return (
              <div key={output.id} className="stack" style={{ gap: 10, marginTop: 14 }}>
                <OutputCard
                  type={output.type}
                  url={output.kind === "poster" ? output.signedUrl : null}
                  content={output.content}
                  watermarked={output.watermarked}
                />

                {isMedia && output.signedUrl && (
                  <ShareButtons
                    url={output.signedUrl}
                    caption={caption}
                    kind={output.kind === "reel" ? "video" : "image"}
                    fileName={`sthamly-${job.id.slice(0, 8)}.${output.kind === "reel" ? "mp4" : "png"}`}
                  />
                )}

                {isMedia && <PublishToggle outputId={output.id} initial={output.published} />}
              </div>
            );
          })}
        </div>
      ))}
    </main>
  );
}