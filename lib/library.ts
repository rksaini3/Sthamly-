import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// नोटबुक और इमेज के पन्नों के लिए एक काम (ऑफ़र + उससे बना पोस्टर और कैप्शन)
export interface LibraryItem {
  jobId: string;
  createdAt: string;
  status: "queued" | "running" | "done" | "failed";
  offerText: string;
  occasion: string | null;
  caption: string;
  posterUrl: string | null;
}

interface OutputRow {
  type: string;
  storage_path: string | null;
  content: string | null;
}

interface JobRow {
  id: string;
  status: LibraryItem["status"];
  created_at: string;
  input: unknown;
  outputs: OutputRow[];
}

const SIGNED_URL_SECONDS = 60 * 60;

function readInput(input: unknown): { offerText: string; occasion: string | null } {
  if (typeof input !== "object" || input === null) return { offerText: "", occasion: null };
  const v = input as Record<string, unknown>;
  return {
    offerText: typeof v.offerText === "string" ? v.offerText : "",
    occasion: typeof v.occasion === "string" && v.occasion.trim() ? v.occasion : null,
  };
}

/** यूज़र के हाल के काम (RLS से सिर्फ़ अपनी दुकान के)। पोस्टर के लिए 1 घंटे वाले signed URL। */
export async function loadLibrary(supabase: ServerClient, limit = 60): Promise<LibraryItem[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, status, created_at, input, outputs(type, storage_path, content)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("library: jobs read failed", error);
    return [];
  }

  const jobs = (data ?? []) as unknown as JobRow[];

  // सारे पोस्टर के URL एक ही बार में
  const paths = jobs.flatMap((job) =>
    job.outputs.filter((o) => o.type === "poster" && o.storage_path).map((o) => o.storage_path as string),
  );
  const urlByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed, error: signError } = await supabase.storage
      .from("outputs")
      .createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (signError) console.error("library: signed urls failed", signError);
    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl) urlByPath.set(entry.path, entry.signedUrl);
    }
  }

  return jobs.map((job) => {
    const poster = job.outputs.find((o) => o.type === "poster" && o.storage_path);
    const caption = job.outputs.find((o) => o.type === "caption")?.content ?? "";
    const { offerText, occasion } = readInput(job.input);
    return {
      jobId: job.id,
      createdAt: job.created_at,
      status: job.status,
      offerText,
      occasion,
      caption,
      posterUrl: poster?.storage_path ? (urlByPath.get(poster.storage_path) ?? null) : null,
    };
  });
}