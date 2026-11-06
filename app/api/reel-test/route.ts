import { NextResponse, type NextRequest } from "next/server";
import { execFile } from "node:child_process";
import { stat, unlink } from "node:fs/promises";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const run = promisify(execFile);

// टेस्ट route: ?key=CRON_SECRET के साथ खोलें। जांच के बाद इसे हटा दें।
export async function GET(req: NextRequest) {
  const { CRON_SECRET } = getServerEnv();
  if (req.nextUrl.searchParams.get("key") !== CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!ffmpegPath) {
    return NextResponse.json({ ok: false, error: "ffmpeg binary नहीं मिला" }, { status: 500 });
  }

  const out = `/tmp/reel-test-${Date.now()}.mp4`;
  const started = Date.now();

  try {
    await run(
      ffmpegPath,
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=0x1a1a2e:s=720x1280:d=10:r=24",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "26",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        out,
      ],
      { timeout: 50_000 },
    );

    const info = await stat(out);
    return NextResponse.json({ ok: true, ms: Date.now() - started, bytes: info.size });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        ms: Date.now() - started,
        error: error instanceof Error ? error.message.slice(0, 500) : "unknown",
      },
      { status: 500 },
    );
  } finally {
    await unlink(out).catch(() => undefined);
  }
}