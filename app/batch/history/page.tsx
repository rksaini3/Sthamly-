import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  queued: "कतार में",
  running: "बन रहा है",
  done: "तैयार",
  failed: "नहीं बन पाया",
};

interface JobRow {
  id: string;
  status: string;
  error: string | null;
  outputs: { id: string; storage_path: string | null }[] | null;
}

interface BatchRow {
  id: string;
  total: number;
  created_at: string;
  jobs: JobRow[] | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("hi-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function BatchHistoryPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/batch/history");

  const { data, error } = await supabase
    .from("batches")
    .select("id, total, created_at, jobs(id, status, error, outputs(id, storage_path))")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("batch history: read failed", error.message);
  }

  const batches = (data ?? []) as BatchRow[];

  return (
    <main className="stack" style={{ padding: 16, gap: 16 }}>
      <header className="stack" style={{ gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>मेरे बैच</h1>
        <Link href="/batch" className="btn btn-primary btn-block">
          नया बैच बनाएं
        </Link>
      </header>

      {error ? (
        <p style={{ color: "#b00020" }}>बैच की सूची नहीं आ पाई, थोड़ी देर बाद दोबारा खोलें।</p>
      ) : null}

      {!error && batches.length === 0 ? (
        <p>अभी कोई बैच नहीं है। ऊपर से नया बैच बनाएं।</p>
      ) : null}

      {batches.map((batch) => {
        const jobs = batch.jobs ?? [];
        const done = jobs.filter((j) => j.status === "done").length;
        const failed = jobs.filter((j) => j.status === "failed").length;

        return (
          <section key={batch.id} className="stack" style={{ gap: 8, border: "1px solid #e5e5e5", borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong>{formatDate(batch.created_at)}</strong>
              <span>
                कुल {batch.total} · तैयार {done}
                {failed > 0 ? ` · नहीं बने ${failed}` : ""}
              </span>
            </div>

            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
              {jobs.map((job, index) => (
                <li key={job.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <span>
                    पोस्टर {index + 1}: {STATUS_LABEL[job.status] ?? job.status}
                  </span>
                  {job.status === "failed" ? (
                    <span style={{ color: "#b00020", fontSize: 13 }}>
                      {job.error === "quota_exceeded"
                        ? "कोटा या वॉलेट कम पड़ा, रिचार्ज करके दोबारा बनाएं"
                        : "तकनीकी गड़बड़ी, दोबारा बनाएं"}
                    </span>
                  ) : null}
                  {job.status === "done" && job.outputs && job.outputs.length > 0 ? (
                    <Link href="/my-posters" style={{ fontSize: 13 }}>
                      देखें / डाउनलोड
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}