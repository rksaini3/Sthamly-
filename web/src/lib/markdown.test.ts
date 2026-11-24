// Sthamly AI web: markdown parser ke tests.
import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, safeHref } from "./markdown";

describe("parseInline", () => {
  it("**bold** ko bold banata hai, tare text mein nahi bachte", () => {
    const out = parseInline("**Subah jaldi utho:** Ek fixed time par");
    expect(out[0]).toEqual({ t: "b", c: [{ t: "text", v: "Subah jaldi utho:" }] });
    expect(out[1]).toEqual({ t: "text", v: " Ek fixed time par" });
  });

  it("adhoora ** (stream ke beech) seedha text rehta hai", () => {
    expect(parseInline("**adhoora")).toEqual([{ t: "text", v: "**adhoora" }]);
  });

  it("*italic* aur `code` sambhalta hai", () => {
    expect(parseInline("ye *khaas* hai")[1]).toEqual({ t: "i", c: [{ t: "text", v: "khaas" }] });
    expect(parseInline("`npm i`")[0]).toEqual({ t: "code", v: "npm i" });
  });

  it("https link banata hai, javascript: nahi", () => {
    const ok = parseInline("[IRCTC](https://www.irctc.co.in)");
    expect(ok[0]).toMatchObject({ t: "a", href: "https://www.irctc.co.in/" });
    const bad = parseInline("[x](javascript:alert(1))");
    expect(bad.some((n) => n.t === "a")).toBe(false);
  });

  it("seedha url ke aakhir ka bindu link mein nahi aata", () => {
    const out = parseInline("dekho https://example.com/a.");
    expect(out[1]).toMatchObject({ t: "a", href: "https://example.com/a" });
    expect(out[2]).toEqual({ t: "text", v: "." });
  });
});

describe("parseMarkdown", () => {
  it("numbered list ko ol banata hai", () => {
    const blocks = parseMarkdown("1. **Ek:** pehla\n2. **Do:** doosra");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ t: "ol" });
    expect((blocks[0] as { items: unknown[] }).items).toHaveLength(2);
  });

  it("bullet list, heading aur paragraph alag blocks", () => {
    const blocks = parseMarkdown("## Sujhav\n\n- pehla\n- doosra\n\nAakhri line");
    expect(blocks.map((b) => b.t)).toEqual(["h", "ul", "p"]);
  });

  it("code fence ke andar markdown nahi chalta", () => {
    const blocks = parseMarkdown("```\n**raw**\n```");
    expect(blocks).toEqual([{ t: "code", v: "**raw**" }]);
  });

  it("band na hua code fence bhi toota nahi", () => {
    expect(parseMarkdown("```\nline")).toEqual([{ t: "code", v: "line" }]);
  });

  it("khaali text par koi block nahi", () => {
    expect(parseMarkdown("  \n\n")).toEqual([]);
  });
});

describe("safeHref", () => {
  it("sirf http aur https", () => {
    expect(safeHref("https://a.b")).toBe("https://a.b/");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("not a url")).toBeNull();
  });
});