import { createClient } from "@supabase/supabase-js";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { NextResponse, type NextRequest } from "next/server";
import { preflight, withCors } from "@/lib/cors";
import { getPublicEnv } from "@/lib/env";
import { userFromBearer } from "@/lib/mobile-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// एक फ़ाइल में ज़्यादा से ज़्यादा इतने नोट (फ़ाइल और समय की सीमा)
const MAX_NOTES = 500;

// DB client: web (cookie) या Android (Bearer), दोनों में RLS इसी user पर लागू हो
type DbClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

interface Session {
  userId: string;
  supabase: DbClient;
}

interface NoteRow {
  id: string;
  kind: "chat" | "poster" | "manual";
  title: string;
  question: string | null;
  content: string;
  tags: string[];
  updated_at: string;
}

const KIND_HI: Record<NoteRow["kind"], string> = {
  chat: "चैट से",
  poster: "पोस्टर",
  manual: "हाथ से लिखा",
};

// Preflight: Android app (Capacitor) पहले OPTIONS भेजता है
export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get("origin"));
}

/**
 * user और उसका DB client पहचानें:
 * 1. Android app: Authorization: Bearer <token>
 * 2. Web app: login cookie
 */
async function sessionFor(req: NextRequest): Promise<Session | null> {
  const bearer = await userFromBearer(req).catch((error: unknown) => {
    console.error("notebook doc: bearer check failed", error);
    return null;
  });

  if (bearer) {
    const env = getPublicEnv();
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    return { userId: bearer.id, supabase: supabase as unknown as DbClient };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { userId: user.id, supabase } : null;
}

// तारीख: भारत के समय में, पढ़ने लायक
function dateText(iso: string): string {
  return new Date(iso).toLocaleString("hi-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// एक लंबे text को लाइनों में तोड़ें, ताकि नई लाइन भी Word में नई पैरा बने
function paragraphsOf(text: string, size: number): Paragraph[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .map(
      (line) =>
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: line.length > 0 ? line : " ", size })],
        }),
    );
}

function buildNoteBlock(note: NoteRow, index: number): Paragraph[] {
  const blocks: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 120 },
      children: [new TextRun({ text: `${index}. ${note.title}` })],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: `${KIND_HI[note.kind]} · ${dateText(note.updated_at)}`,
          size: 18,
          color: "6B6B6B",
        }),
      ],
    }),
  ];

  if (note.question && note.question.trim()) {
    blocks.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({ text: "सवाल: ", bold: true }),
          new TextRun({ text: note.question }),
        ],
      }),
    );
  }

  blocks.push(...paragraphsOf(note.content, 24));

  if (note.tags.length > 0) {
    blocks.push(
      new Paragraph({
        spacing: { before: 120 },
        children: [new TextRun({ text: `टैग: ${note.tags.map((t) => `#${t}`).join("  ")}`, size: 18, color: "6B6B6B" })],
      }),
    );
  }

  return blocks;
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  try {
    return withCors(await handleExport(req), origin);
  } catch (error) {
    console.error("notebook doc: unexpected error", error);
    return withCors(
      NextResponse.json({ error: { code: "INTERNAL", message: "Word फ़ाइल नहीं बन पाई, दोबारा कोशिश करें" } }, { status: 500 }),
      origin,
    );
  }
}

async function handleExport(req: NextRequest): Promise<NextResponse> {
  const session = await sessionFor(req);
  if (!session) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "पहले लॉग-इन करें" } }, { status: 401 });
  }

  // RLS से सिर्फ़ अपने नोट, पिन वाले पहले, फिर सबसे नए बदले हुए
  const { data, error } = await session.supabase
    .from("notebook_notes")
    .select("id, kind, title, question, content, tags, updated_at")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(MAX_NOTES);

  if (error) {
    console.error("notebook doc: read failed", error);
    return NextResponse.json({ error: { code: "READ_FAILED", message: "नोट नहीं खुल पाए" } }, { status: 500 });
  }
  const notes = (data ?? []) as NoteRow[];

  // शीर्षक वाला हिस्सा
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 120 },
      children: [new TextRun({ text: "Sthamly नोटबुक" })],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [
        new TextRun({ text: `बनाया गया: ${dateText(new Date().toISOString())} · कुल नोट: ${notes.length}`, size: 18, color: "6B6B6B" }),
      ],
    }),
  ];

  if (notes.length === 0) {
    children.push(new Paragraph({ children: [new TextRun({ text: "अभी कोई नोट नहीं है।" })] }));
  }

  notes.forEach((note, i) => {
    children.push(...buildNoteBlock(note, i + 1));
  });

  const doc = new Document({
    creator: "Sthamly",
    title: "Sthamly नोटबुक",
    styles: {
      default: {
        document: {
          run: { font: "Nirmala UI", size: 24 },
        },
      },
    },
    sections: [{ properties: {}, children }],
  });

  const buffer = await Packer.toBuffer(doc);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="notebook-${today}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}