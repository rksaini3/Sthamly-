import Link from "next/link";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/dashboard/AutoRefresh";
import { OutputCard } from "@/components/dashboard/OutputCard";
import { ShareButtons } from "@/components/dashboard/ShareButtons";
import { PublishToggle } from "@/components/my-posters/PublishToggle";
import { ComingSoon } from "@/components/roles/ComingSoon";
import { formatDate } from "@/lib/format";
import { isRole } from "@/lib/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { JobStatus, OutputType } from "@/types/domain";

export const dynamic = "force-dynamic";

// मुफ़्त और VIP की महीने की सीमा (lib/quota.ts से मेल खाती है)
const LIMITS = {
  free: { poster: 5, reel: 1 },
  vip: { poster: 60, reel: 10 },
} as const;

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
  published: boolean;
}

interface JobRow {
  id: string;
  status: JobStatus;
  error: string | null;
  created_at: string;
  outputs: OutputRow[];
}

// भारत के समय (IST) के हिसाब से इस महीने की शुरुआत
function monthStartIST(): string {
  const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const startUTC =
    Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), 1) - 5.5 * 60 * 60 * 1000;
  return new Date(startUTC).toISOString();
}

function ChoiceLink({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} className="card stack" style={{ gap: 4, textDecoration: "none" }}>
      <strong>{title}</strong>
      <span className="muted" style={{ fontSize: "0.9rem" }}>{desc}</span>
    </Link>
  );
}

export default async function PostsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/my-posters");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, plan")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role;
  if (!isRole(role)) redirect("/role");

  if (role !== "shopkeeper") {
    return (
      <main className="page stack">
        <h1 style={{ margin: 0 }}>पोस्ट</h1>
        <ComingSoon role={role} />
      </main>
    );
  }

  const plan: "free" | "vip" = profile?.plan === "vip" ? "vip" : "free";

  // इस महीने कितना इस्तेमाल हुआ
  const admin = createSupabaseAdminClient();
  const since = monthStartIST();
  const [posterUsed, reelUsed] = await Promise.all([
    admin.rpc("credit_used", { p_user: user.id, p_kind: "poster", p_since: since }),
    admin.rpc("credit_used", { p_user: user.id, p_kind: "reel", p_since: since }),
  ]);
  const posterLeft = Math.max(0, LIMITS[plan].poster - Number(posterUsed.data ?? 0));
  const reelLeft = Math.max(0, LIMITS[plan].reel - Number(reelUsed.data ?? 0));

  const { data, error } = await supabase
    .from("jobs")
    .select("id, status, error, created_at, outputs(id, type, storage_path, content, watermarked, published)")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("posts: jobs read failed", error);
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

      <h1 style={{ margin: 0 }}>पोस्ट</h1>

      {/* बनाने के विकल्प */}
      <div className="stack" style={{ gap: 10 }}>
        <ChoiceLink
          href="/onboarding?kind=poster"
          title="पोस्टर (फ़ोटो)"
          desc="दुकान की फ़ोटो और ऑफ़र से पोस्टर और कैप्शन"
        />
        <ChoiceLink
          href="/onboarding?kind=reel"
          title="रील (वीडियो)"
          desc="छोटी वीडियो रील बनाएं"
        />
        <ChoiceLink
          href="/feed"
          title="घोषणा (सिर्फ़ टेक्स्ट)"
          desc="बिना फ़ोटो और वीडियो के घोषणा करें"
        />
      </div>

      {/* कोटा और चार्ज */}
      <div className="card stack" style={{ gap: 6 }}>
        {plan === "vip" ? (
          <>
            <strong>VIP प्लान</strong>
            <p className="muted" style={{ margin: 0 }}>
              इस महीने पोस्टर {posterLeft} बचे, रील {reelLeft} बची। अलग से कोई चार्ज नहीं।
            </p>
          </>
        ) : (
          <>
            <strong>इस महीने मुफ़्त</strong>
            <p className="muted" style={{ margin: 0 }}>
              पोस्टर {posterLeft} बचे, रील {reelLeft} बची।
            </p>
            {(posterLeft === 0 || reelLeft === 0) && (
              <p className="alert" style={{ margin: 0 }}>
                मुफ़्त कोटा खत्म होने पर पोस्टर के लिए ₹2 प्रति पोस्टर (₹10 में 5 क्रेडिट) और AI रील के लिए ₹15 प्रति रील लगेगा।
              </p>
            )}
            <Link href="/pricing" className="btn btn-primary btn-block">
              रिचार्ज करें
            </Link>
          </>
        )}
      </div>

      {rows.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>अभी कोई पोस्टर या रील नहीं बना है।</p>
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
              इस बार बन नहीं पाया। आपका credit वापस कर दिया गया है।
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