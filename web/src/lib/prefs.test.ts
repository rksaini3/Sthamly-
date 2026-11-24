// Prefs ke tests: galat ya khaali value par default, partner sirf sahi string par.
import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, parsePrefs } from "./prefs";

describe("parsePrefs", () => {
  it("khaali ho to default", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
  });

  it("kharab JSON ho to default", () => {
    expect(parsePrefs("{x")).toEqual(DEFAULT_PREFS);
  });

  it("partner aur large sahi se padhta hai", () => {
    expect(parsePrefs(JSON.stringify({ role: "partner", textSize: "large" }))).toEqual({
      role: "partner",
      textSize: "large",
    });
  });

  it("anjaani value user aur normal banti hai", () => {
    expect(parsePrefs(JSON.stringify({ role: "admin", textSize: "huge" }))).toEqual(DEFAULT_PREFS);
  });
});