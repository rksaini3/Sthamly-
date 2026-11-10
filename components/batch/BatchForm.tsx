"use client";

import Link from "next/link";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const PHOTO_BUCKET = "shop-photos";
const MAX_BATCH = 10;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png"];

interface Quote {
  count: number;
  coveredByQuota: number;
  fromWallet: number;
  costPaise: number;
  costLabel: string;
  walletLabel: string;
  enoughWallet: boolean;
  quotaWindow: "day" | "week" | "month";
}

interface RunResult {
  started: number;
  notStarted: number;
  stoppedReason: string | null;
}

type Phase = "idle" | "quoting" | "ready" | "running" | "done";

const WINDOW_TEXT: Record<Quote["quotaWindow"], string> = {
  day: "आज",
  week: "इस हफ़्ते",
  month: "इस महीने",
};

export function BatchForm({ shopId }: { shopId: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [offerText, setOfferText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    setQuote(null);
    setPhase("idle");
    const picked = Array.from(e.target.files ?? []);

    if (picked.length > MAX_BATCH) {
      setError(`एक बार में ${MAX_BATCH} फ़ोटो तक`);
      setFiles([]);
      return;
    }
    const bad = picked.find((f) => !ALLOWED_PHOTO_TYPES.includes(f.type) || f.size > MAX_PHOTO_BYTES);
    if (bad) {
      setError("सिर्फ़ JPG या PNG, हर फ़ोटो 10MB तक");
      setFiles([]);
      return;
    }
    setFiles(picked);
  }

  // पहले सिर्फ़ कीमत दिखाते हैं, कुछ कटता नहीं
  async function getQuote(e: FormEvent) {
    e.preventDefault();
    if (files.length === 0 || offerText.trim().length < 3) {
      setError("फ़ोटो चुनें और ऑफ़र लिखें (कम से कम 3 अक्षर)");
      return;
    }

    setError(null);
    setPhase("quoting");
    try {
      const res = await fetch("/api/batch/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: files.length }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "कुछ गड़बड़ हुई");
        setPhase("idle");
        return;
      }
      setQuote(data as Quote);
      setPhase("ready");
    } catch {
      setError("नेटवर्क की गड़बड़ी, दोबारा कोशिश करें");
      setPhase("idle");
    }
  }

  // पुष्टि के बाद: फ़ोटो अपलोड, फिर बैच शुरू
  async function startBatch() {
    if (!quote) return;
    setError(null);
    setPhase("running");
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("पहले लॉग-इन करें");
        setPhase("ready");
        return;
      }

      const photoPaths: string[] = [];
      for (const file of files) {
        const ext = file.type === "image/png" ? "png" : "jpg";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, file, { contentType: file.type });
        if (uploadError) throw uploadError;
        photoPaths.push(path);
      }

      const res = await fetch("/api/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          offerText: offerText.trim(),
          photoPaths,
          language: "hinglish",
          confirmed: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "बैच शुरू नहीं हो सका");
        setPhase("ready");
        return;
      }

      setResult({
        started: data.started,
        notStarted: data.notStarted,
        stoppedReason: data.stoppedReason,
      });
      setPhase("done");
    } catch (err) {
      console.error("batch: start failed", err);
      setError("फ़ोटो अपलोड नहीं हो सकीं, दोबारा कोशिश करें");
      setPhase("ready");
    }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <form className="card stack" style={{ gap: 10 }} onSubmit={getQuote}>
        <label className="stack" style={{ gap: 4 }}>
          <strong>फ़ोटो चुनें (1 से 10)</strong>
          <input
            type="file"
            accept="image/jpeg,image/png"
            multiple
            onChange={onPick}
            disabled={phase === "running"}
          />
        </label>
        {files.length > 0 && <span className="muted">{files.length} फ़ोटो चुनी गईं</span>}

        <label className="stack" style={{ gap: 4 }}>
          <strong>ऑफ़र या बात (सभी पोस्टर पर लागू)</strong>
          <input
            type="text"
            value={offerText}
            maxLength={300}
            placeholder="जैसे: दिवाली सेल 20% छूट"
            disabled={phase === "running"}
            onChange={(e) => {
              setOfferText(e.target.value);
              setQuote(null);
              setPhase("idle");
            }}
          />
        </label>

        <button type="submit" disabled={phase === "quoting" || phase === "running" || files.length === 0}>
          {phase === "quoting" ? "हिसाब लग रहा है…" : "कीमत देखें"}
        </button>
      </form>

      {quote && phase !== "done" && (
        <section className="card stack" style={{ gap: 6 }}>
          <strong>{quote.count} पोस्टर</strong>
          <span>
            {WINDOW_TEXT[quote.quotaWindow]} कोटे से: {quote.coveredByQuota}
          </span>
          <span>
            वॉलेट से: {quote.fromWallet} पोस्टर, कुल कटेगा {quote.costLabel}
          </span>
          <span className="muted">आपका वॉलेट: {quote.walletLabel}</span>

          {quote.enoughWallet ? (
            <button type="button" onClick={startBatch} disabled={phase === "running"}>
              {phase === "running" ? "बन रहे हैं…" : "हां, बनाएं"}
            </button>
          ) : (
            <span>
              वॉलेट में पैसे कम हैं। <Link href="/pricing">टॉप-अप लें</Link>
            </span>
          )}
        </section>
      )}

      {phase === "done" && result && (
        <section className="card stack" style={{ gap: 6 }}>
          <strong>{result.started} पोस्टर बनने के लिए भेज दिए गए</strong>
          {result.notStarted > 0 && (
            <span>{result.notStarted} फ़ोटो शुरू नहीं हुईं (कोटा या वॉलेट खत्म)</span>
          )}
          <Link href="/my-posters">मेरे बनाए देखें</Link>
        </section>
      )}

      {error && (
        <span role="alert" style={{ color: "crimson" }}>
          {error}
        </span>
      )}
    </div>
  );
}