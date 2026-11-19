// Sthamly AI Worker: Phase 1 unit tests (Blueprint 3.0, section 6, 7, 9)
// Ye tests bina network aur bina Supabase ke chalte hain. Sirf pure functions.
// Injection aur SSRF tests Phase 3 mein aayenge, jab tool loop, connectors aur URL check bane honge.

import { describe, expect, it } from "vitest";
import { ApiError, isErrorCode, toErrorResponse } from "../src/errors";
import { encodeEvent } from "../src/sse";
import { stageFor } from "../src/budget";
import { estimateCostInr } from "../src/providers/types";
import { assertPlanAllows, assertWithinDailyQuota, type UserContext } from "../src/plan";

// Ek function ko chalakar uska ApiError code lautaata hai. Error na aaye to null.
function errorCodeOf(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof ApiError ? err.code : "not_api_error";
  }
}

describe("error contract (blueprint section 6)", () => {
  it("rate_limited 429 aur retryable hota hai", () => {
    const err = new ApiError("rate_limited");
    expect(err.status).toBe(429);
    expect(err.retryable).toBe(true);
  });

  it("unauthenticated retryable nahi hota", () => {
    const err = new ApiError("unauthenticated");
    expect(err.status).toBe(401);
    expect(err.retryable).toBe(false);
  });

  it("unknown error ka raw message client tak nahi jaata", async () => {
    const res = toErrorResponse(new Error("upstream failed with key sk-live-SECRET123"), "req-1");
    const text = await res.text();
    const body = JSON.parse(text) as { error: { code: string; request_id: string } };

    expect(res.status).toBe(500);
    expect(text).not.toContain("SECRET123");
    expect(body.error.code).toBe("internal");
    expect(body.error.request_id).toBe("req-1");
  });

  it("isErrorCode sirf fixed codes ko manta hai", () => {
    expect(isErrorCode("tool_denied")).toBe(true);
    expect(isErrorCode("made_up_code")).toBe(false);
    expect(isErrorCode(42)).toBe(false);
  });
});

describe("SSE framing (blueprint section 6)", () => {
  it("event ek sahi block mein likha jaata hai", async () => {
    const text = new TextDecoder().decode(encodeEvent({ event: "delta", data: { text: "नमस्ते" } }));

    expect(text.startsWith("event: delta\ndata: ")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(true);
    const payload = text.slice("event: delta\ndata: ".length, -2);
    expect(JSON.parse(payload)).toEqual({ text: "नमस्ते" });
  });

  it("text mein newline ho to bhi block nahi tootta", () => {
    const text = new TextDecoder().decode(encodeEvent({ event: "delta", data: { text: "line1\n\nline2" } }));

    // Ek event = ek hi block terminator (\n\n) ke baad khatam. Andar ke newlines JSON mein escape hote hain.
    expect(text.split("\n\n")).toHaveLength(2);
  });
});

describe("budget stages (blueprint section 7)", () => {
  it("50% tak normal rehta hai", () => {
    expect(stageFor(0)).toBe("normal");
    expect(stageFor(0.5)).toBe("normal");
    expect(stageFor(0.99)).toBe("normal");
  });

  it("100% par cheap chat only", () => {
    expect(stageFor(1.0)).toBe("cheap_chat_only");
    expect(stageFor(1.05)).toBe("cheap_chat_only");
  });

  it("110% par free users bhi band", () => {
    expect(stageFor(1.1)).toBe("block_free");
    expect(stageFor(2)).toBe("block_free");
  });
});

describe("cost estimate (blueprint section 7)", () => {
  const model = { priceInUsdPerMtok: 0.59, priceOutUsdPerMtok: 0.79 };

  it("10 lakh input tokens ka cost rupees mein", () => {
    // 1M tokens * $0.59 = $0.59, * 85 = Rs 50.15
    expect(estimateCostInr(model, 1_000_000, 0, 85)).toBeCloseTo(50.15, 2);
  });

  it("input aur output dono jodte hain", () => {
    // $0.59 + $0.79 = $1.38, * 85 = Rs 117.30
    expect(estimateCostInr(model, 1_000_000, 1_000_000, 85)).toBeCloseTo(117.3, 2);
  });

  it("zero tokens par zero cost", () => {
    expect(estimateCostInr(model, 0, 0, 85)).toBe(0);
  });
});

describe("plan limits (blueprint section 8)", () => {
  const base: UserContext = {
    userId: "00000000-0000-0000-0000-000000000001",
    language: "hi",
    historyEnabled: true,
    memoryEnabled: false,
    plan: {
      plan: "free",
      dailyTokens: 1000,
      maxOutputTokens: 100,
      dailyLiveMinutes: 0,
      connectorCount: 0,
      fileLimitPerDay: 0,
    },
    subscriptionStatus: "active",
    tokensUsedToday: 0,
  };

  it("quota ke andar request chalti hai", () => {
    expect(errorCodeOf(() => assertWithinDailyQuota(base, 1000))).toBeNull();
  });

  it("quota paar ho to budget_exceeded", () => {
    const ctx = { ...base, tokensUsedToday: 950 };
    expect(errorCodeOf(() => assertWithinDailyQuota(ctx, 100))).toBe("budget_exceeded");
  });

  it("free plan par plus ka feature plan_required", () => {
    expect(errorCodeOf(() => assertPlanAllows(base, "plus"))).toBe("plan_required");
  });

  it("free plan par free ka feature chalta hai", () => {
    expect(errorCodeOf(() => assertPlanAllows(base, "free"))).toBeNull();
  });
});