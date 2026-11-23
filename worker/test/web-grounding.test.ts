// Sthamly AI Worker: live search ka trigger, Tavily jawab ka parse, aur messages mein jodna.
import { describe, expect, it } from "vitest";
import { needsLiveInfo, parseTavilyAnswer, withLiveContext } from "../src/providers/web-grounding";

describe("needsLiveInfo", () => {
  it("train, hotel aur price wale sawal live maange jaate hain", () => {
    expect(needsLiveInfo("कानपुर से दिल्ली कल सुबह की सस्ती ट्रेन बताओ")).toBe(true);
    expect(needsLiveInfo("1000 रुपये तक का hotel batao")).toBe(true);
    expect(needsLiveInfo("आज की ख़बर क्या है")).toBe(true);
  });
  it("aam sawal par live search nahi hota", () => {
    expect(needsLiveInfo("मेरे लिए एक ईमेल का ड्राफ़्ट बनाओ")).toBe(false);
    expect(needsLiveInfo("किसी विषय को आसान भाषा में समझाओ")).toBe(false);
  });
});

describe("parseTavilyAnswer", () => {
  it("answer aur results ke sources nikalta hai, duplicate link ek baar", () => {
    const body = {
      answer: "12877 गरीब रथ सुबह 05:40 पर निकलती है।",
      results: [
        { title: "Train info", url: "https://example.com/train", content: "गरीब रथ का समय" },
        { title: "dup", url: "https://example.com/train", content: "दोहराव" },
      ],
    };
    const out = parseTavilyAnswer(body);
    expect(out?.text).toContain("गरीब रथ");
    expect(out?.sources).toEqual([{ title: "Train info", url: "https://example.com/train" }]);
  });

  it("answer na ho to results ke snippets se text banta hai", () => {
    const body = {
      answer: null,
      results: [{ title: "Hotel", url: "https://example.com/h", content: "होटल ₹900 से शुरू" }],
    };
    expect(parseTavilyAnswer(body)?.text).toContain("₹900");
  });

  it("khaali ya ajeeb jawab par null", () => {
    expect(parseTavilyAnswer({})).toBeNull();
    expect(parseTavilyAnswer({ answer: "", results: [] })).toBeNull();
    expect(parseTavilyAnswer("text")).toBeNull();
  });

  it("javascript: wale link source mein nahi jaate", () => {
    const body = {
      answer: "जवाब",
      results: [{ title: "x", url: "javascript:alert(1)", content: "y" }],
    };
    expect(parseTavilyAnswer(body)?.sources).toEqual([]);
  });
});

describe("withLiveContext", () => {
  it("system note aakhri user sawal se pehle jodta hai", () => {
    const msgs = [
      { role: "system" as const, content: "base" },
      { role: "user" as const, content: "ट्रेन बताओ" },
    ];
    const out = withLiveContext(msgs, { text: "12877 रवाना 05:40", sources: [{ title: "T", url: "https://a.b" }] });
    expect(out).toHaveLength(3);
    expect(out[1]?.role).toBe("system");
    expect(out[1]?.content).toContain("12877");
    expect(out[1]?.content).toContain("https://a.b");
    expect(out[2]).toEqual({ role: "user", content: "ट्रेन बताओ" });
  });
});