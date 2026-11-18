import { z } from "zod";
import { searchWeb } from "@/lib/assistant/search";
import { createJob } from "@/lib/jobs/create";
import type { Lang } from "@/lib/i18n";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// ---- Types ----

export interface AgentContext {
  userId: string;
  threadId: string | null;
  lang: Lang;
  // इस run में अभी कितनी वेब खोज बाकी है (loop बनाता है और हर खोज पर घटता है)।
  // न दिया हो तो खोज पर कोई सीमा नहीं लगती (confirm route में यह नहीं होता)।
  searchesLeft?: number;
}

export type ToolResult =
  | { ok: true; text: string; data?: Record<string, unknown> }
  | { ok: false; message: string };

// "auto": बिना पूछे चलेगा (सिर्फ़ पढ़ना या बिना खर्च वाला काम)
// "confirm": पहले user की मंज़ूरी लेगा (पैसे, नया बनाना, public)
export type Permission = "auto" | "confirm";

interface ToolDef<S extends z.ZodType> {
  name: string;
  description: string;
  // model को बताने के लिए arguments का छोटा रूप
  argsHint: string;
  schema: S;
  permission: Permission;
  // confirm वाले tool के लिए user को दिखने वाली एक लाइन
  summarize: (args: z.infer<S>) => string;
  run: (args: z.infer<S>, ctx: AgentContext) => Promise<ToolResult>;
}

export interface AnyTool {
  name: string;
  description: string;
  argsHint: string;
  schema: z.ZodType;
  permission: Permission;
  // arguments को पहले जांचा जाता है: गलत हों तो summarize और run दोनों नहीं चलते
  parse: (raw: unknown) => { ok: true; args: unknown } | { ok: false; message: string };
  summarize: (args: unknown) => string;
  run: (args: unknown, ctx: AgentContext) => Promise<ToolResult>;
}

function defineTool<S extends z.ZodType>(def: ToolDef<S>): AnyTool {
  return {
    name: def.name,
    description: def.description,
    argsHint: def.argsHint,
    schema: def.schema,
    permission: def.permission,
    parse(raw) {
      const parsed = def.schema.safeParse(raw);
      if (!parsed.success) return { ok: false, message: "सही जानकारी नहीं मिली" };
      return { ok: true, args: parsed.data };
    },
    summarize(args) {
      return def.summarize(args as z.infer<S>);
    },
    async run(args, ctx) {
      return def.run(args as z.infer<S>, ctx);
    },
  };
}

// ---- Helpers ----

const JOB_STATUS_HI: Record<string, string> = {
  queued: "कतार में है",
  running: "बन रहा है",
  retry: "दोबारा कोशिश हो रही है",
  done: "तैयार है",
  failed: "नहीं बन पाया",
};

// user की दुकानों की id: सभी tool इसी से जांचते हैं कि data उसी का है
async function ownedShopIds(userId: string): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("shops").select("id").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((s) => s.id);
}

// ---- Tools ----

const getJobStatus = defineTool({
  name: "get_job_status",
  description: "किसी पोस्टर या काम की ताज़ा स्थिति देखना (सिर्फ़ पढ़ना)",
  argsHint: '{"jobId": "uuid"}',
  schema: z.object({ jobId: z.uuid() }),
  permission: "auto",
  summarize: () => "पोस्टर की स्थिति देखी जाएगी",
  async run(args, ctx) {
    const shopIds = await ownedShopIds(ctx.userId);
    if (shopIds.length === 0) return { ok: false, message: "कोई दुकान नहीं मिली" };

    const admin = createSupabaseAdminClient();
    const { data: job, error } = await admin
      .from("jobs")
      .select("id, status, error")
      .eq("id", args.jobId)
      .in("shop_id", shopIds)
      .maybeSingle();

    if (error) return { ok: false, message: "स्थिति नहीं मिल पाई" };
    if (!job) return { ok: false, message: "ऐसा काम नहीं मिला" };

    const label = JOB_STATUS_HI[job.status] ?? job.status;
    return {
      ok: true,
      text: `पोस्टर ${label}।${job.error && job.status === "failed" ? ` कारण: ${job.error}` : ""}`,
      data: { jobId: job.id, status: job.status },
    };
  },
});

const listRecentJobs = defineTool({
  name: "list_recent_jobs",
  description: "हाल के पोस्टर और उनकी स्थिति की सूची (सिर्फ़ पढ़ना)",
  argsHint: '{"limit": 1-10 (default 5)}',
  schema: z.object({ limit: z.number().int().min(1).max(10).optional() }),
  permission: "auto",
  summarize: () => "हाल के पोस्टर देखे जाएंगे",
  async run(args, ctx) {
    const shopIds = await ownedShopIds(ctx.userId);
    if (shopIds.length === 0) return { ok: true, text: "अभी कोई पोस्टर नहीं है।" };

    const admin = createSupabaseAdminClient();
    const { data: jobs, error } = await admin
      .from("jobs")
      .select("id, status, created_at")
      .in("shop_id", shopIds)
      .order("created_at", { ascending: false })
      .limit(args.limit ?? 5);

    if (error) return { ok: false, message: "सूची नहीं मिल पाई" };
    if (!jobs || jobs.length === 0) return { ok: true, text: "अभी कोई पोस्टर नहीं है।" };

    const lines = jobs.map((j, i) => `${i + 1}. ${JOB_STATUS_HI[j.status] ?? j.status}`);
    return {
      ok: true,
      text: `हाल के ${jobs.length} पोस्टर:\n${lines.join("\n")}`,
      data: { jobs: jobs.map((j) => ({ id: j.id, status: j.status })) },
    };
  },
});

const webSearch = defineTool({
  name: "web_search",
  description:
    "इंटरनेट से ताज़ा जानकारी खोजना, जैसे आज का बाज़ार, ट्रेंड, खबर या किसी चीज़ का हाल (सिर्फ़ पढ़ना)। एक बातचीत में एक ही बार चलता है, इसलिए पूरा सवाल एक बार में दो।",
  argsHint: '{"query": "खोज का सवाल, साफ़ और पूरा (2 से 300 अक्षर)"}',
  schema: z.object({ query: z.string().trim().min(2).max(300) }),
  permission: "auto",
  summarize: (args) => `इंटरनेट पर खोजा जाएगा: ${args.query}`,
  async run(args, ctx) {
    // एक run में खोज की सीमा (हर खोज का खर्च चैट से कई गुना है)
    if (ctx.searchesLeft !== undefined) {
      if (ctx.searchesLeft <= 0) {
        return { ok: false, message: "इस बार की खोज हो चुकी है। अब तक मिली जानकारी से जवाब दो।" };
      }
      ctx.searchesLeft -= 1;
    }

    try {
      const found = await searchWeb({ query: args.query, lang: ctx.lang });
      if (!found.answer) return { ok: false, message: "इस बारे में ताज़ा जानकारी नहीं मिली।" };

      const sources = found.sources.length > 0 ? `\nस्रोत: ${found.sources.join(", ")}` : "";
      return {
        ok: true,
        text: `${found.answer}${sources}`,
        data: { queries: found.queries, sources: found.sources },
      };
    } catch (error) {
      // असली कारण logs में; user को सादा संदेश
      console.error("web_search failed", error);
      return { ok: false, message: "अभी इंटरनेट पर खोज नहीं हो पाई।" };
    }
  },
});

const createPoster = defineTool({
  name: "create_poster",
  description: "दुकान के लिए नया पोस्टर बनाना (इसमें credit लगता है, इसलिए मंज़ूरी चाहिए)",
  argsHint:
    '{"offerText": "string (3-300 अक्षर)", "occasion": "string | null", "language": "hinglish|hindi|bhojpuri|awadhi"}',
  schema: z.object({
    offerText: z.string().trim().min(3).max(300),
    occasion: z.string().trim().max(60).nullable().optional(),
    language: z.enum(["hinglish", "hindi", "bhojpuri", "awadhi"]).default("hinglish"),
  }),
  permission: "confirm",
  summarize: (args) => `"${args.offerText}" का पोस्टर बनेगा (1 पोस्टर credit लगेगा)`,
  async run(args, ctx) {
    const admin = createSupabaseAdminClient();
    const { data: shop, error: shopError } = await admin
      .from("shops")
      .select("id")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (shopError) return { ok: false, message: "दुकान की जानकारी नहीं मिली" };
    if (!shop) return { ok: false, message: "पहले दुकान की जानकारी भरें" };

    const result = await createJob({
      userId: ctx.userId,
      shopId: shop.id,
      offerText: args.offerText,
      occasion: args.occasion ?? null,
      photoPaths: [],
      language: args.language,
      wantReel: false,
      // चैट/एजेंट से बना काम: नोटबुक की "चैट से अपने आप जोड़ें" सेटिंग इसी पर लागू होगी
      fromChat: true,
    });

    if (!result.ok) {
      const messages: Record<string, string> = {
        QUOTA_EXCEEDED: "इस महीने का कोटा खत्म हो गया। Top-up लें या प्लान अपग्रेड करें।",
        SHOP_NOT_FOUND: "दुकान नहीं मिली",
        FORBIDDEN: "फोटो का रास्ता मान्य नहीं है",
      };
      return { ok: false, message: messages[result.code] ?? "पोस्टर शुरू नहीं हो पाया" };
    }

    return {
      ok: true,
      text: "पोस्टर बनने लगा है। नतीजा “मेरे पोस्टर” में दिखेगा।",
      data: { jobId: result.jobId, remaining: result.remaining },
    };
  },
});

// ---- Registry ----

export const TOOLS: AnyTool[] = [getJobStatus, listRecentJobs, webSearch, createPoster];

export function findTool(name: string): AnyTool | undefined {
  return TOOLS.find((t) => t.name === name);
}

// model को भेजने के लिए tools की सूची
export function toolCatalogText(): string {
  return TOOLS.map((t) => {
    const mode = t.permission === "confirm" ? " [मंज़ूरी चाहिए]" : "";
    return `- ${t.name}${mode}: ${t.description}\n  arguments: ${t.argsHint}`;
  }).join("\n");
}