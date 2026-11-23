// Sthamly AI Worker: planner ke jawab ki jaanch aur keyword fallback (model par bharosa nahi, isliye har galti ka fallback).
import { describe, expect, it } from "vitest";
import {
  composePlannerInput,
  estimatePlanCostInr,
  estimateStepCostInr,
  guessPlanFromKeywords,
  MAX_PLAN_STEPS,
  parsePlan,
} from "../src/orchestrator/planner";

describe("parsePlan: chat route", () => {
  it("सवाल हो तो chat route और role लेता है", () => {
    expect(parsePlan(JSON.stringify({ route: "chat", role: "shop" }))).toEqual({
      route: "chat",
      role: "shop",
      steps: [],
    });
  });

  it("अजनबी role हो तो general", () => {
    expect(parsePlan(JSON.stringify({ route: "chat", role: "pilot" })).role).toBe("general");
  });

  it("खराब JSON हो तो chat, general role के साथ", () => {
    expect(parsePlan("यह JSON नहीं है")).toEqual({ route: "chat", role: "general", steps: [] });
  });
});

describe("parsePlan: create route", () => {
  it("सही JSON से steps और role लेता है", () => {
    const raw = JSON.stringify({
      route: "create",
      role: "shop",
      steps: [
        { kind: "image", prompt: "सेल का पोस्टर" },
        { kind: "website", prompt: "दुकान की वेबसाइट" },
      ],
    });
    expect(parsePlan(raw)).toEqual({
      route: "create",
      role: "shop",
      steps: [
        { kind: "image", prompt: "सेल का पोस्टर" },
        { kind: "website", prompt: "दुकान की वेबसाइट" },
      ],
    });
  });

  it("अनजान kind छोड़ देता है", () => {
    const raw = JSON.stringify({
      route: "create",
      steps: [
        { kind: "video", prompt: "कुछ" },
        { kind: "slides", prompt: "पिच डेक" },
      ],
    });
    expect(parsePlan(raw).steps).toEqual([{ kind: "slides", prompt: "पिच डेक" }]);
  });

  it("सारे steps गलत हों तो chat route पर लौटता है, file नहीं बनती", () => {
    const raw = JSON.stringify({ route: "create", steps: [{ kind: "video", prompt: "x" }, { kind: "image" }] });
    expect(parsePlan(raw).route).toBe("chat");
    expect(parsePlan(raw).steps).toEqual([]);
  });

  it("MAX_PLAN_STEPS से ज़्यादा steps को काट देता है", () => {
    const many = Array.from({ length: MAX_PLAN_STEPS + 3 }, () => ({ kind: "document", prompt: "ए" }));
    expect(parsePlan(JSON.stringify({ route: "create", steps: many })).steps).toHaveLength(MAX_PLAN_STEPS);
  });

  it("```json code fence के अंदर का JSON भी पढ़ता है", () => {
    const raw = '```json\n{"route":"create","steps":[{"kind":"image","prompt":"लोगो"}]}\n```';
    expect(parsePlan(raw).steps).toEqual([{ kind: "image", prompt: "लोगो" }]);
  });
});

describe("guessPlanFromKeywords", () => {
  it("'bnao' के साथ तस्वीर का शब्द हो तो image create", () => {
    const plan = guessPlanFromKeywords("Yeh jaisa hi hi waisa hi image bnao");
    expect(plan?.route).toBe("create");
    expect(plan?.steps[0]?.kind).toBe("image");
  });

  it("स्लाइड बनाने का अनुरोध slides बनता है", () => {
    expect(guessPlanFromKeywords("मेरी दुकान पर स्लाइड बना दो")?.steps[0]?.kind).toBe("slides");
  });

  it("वेबसाइट बनाने का अनुरोध website बनता है", () => {
    expect(guessPlanFromKeywords("दुकान की वेबसाइट banao")?.steps[0]?.kind).toBe("website");
  });

  it("सिर्फ़ सवाल या सलाह हो तो null (chat)", () => {
    expect(guessPlanFromKeywords("पोस्टर कैसे बनाते हैं, सलाह दो")).toBeNull();
    expect(guessPlanFromKeywords("मेरी दुकान का नाम क्या रखूँ")).toBeNull();
  });

  it("बनाने का शब्द हो पर किस चीज़ का नहीं, तो null", () => {
    expect(guessPlanFromKeywords("इसका use case bnao")).toBeNull();
  });
});

describe("composePlannerInput", () => {
  it("बिना पिछली बातचीत के सिर्फ़ नया संदेश लौटाता है", () => {
    expect(composePlannerInput("नमस्ते", [])).toBe("नमस्ते");
  });

  it("पिछली बातचीत और नया संदेश दोनों जोड़ता है", () => {
    const out = composePlannerInput("ये जैसा image bnao", [
      { role: "user", content: "HDFC, ICICI, Axis बैंक पर रिपोर्ट" },
      { role: "assistant", content: "ये तीन बैंक टॉप पिक हैं" },
    ]);
    expect(out).toContain("पिछली बातचीत:");
    expect(out).toContain("उपयोगकर्ता: HDFC, ICICI, Axis बैंक पर रिपोर्ट");
    expect(out).toContain("सहायक: ये तीन बैंक टॉप पिक हैं");
    expect(out.endsWith("नया संदेश: ये जैसा image bnao")).toBe(true);
  });
});

describe("estimateStepCostInr", () => {
  it("slides में तस्वीरों का खर्च भी जुड़ता है", () => {
    expect(estimateStepCostInr("slides")).toBeGreaterThan(estimateStepCostInr("image"));
    expect(estimatePlanCostInr([{ kind: "document", prompt: "a" }, { kind: "image", prompt: "b" }])).toBeCloseTo(4, 5);
  });
});
