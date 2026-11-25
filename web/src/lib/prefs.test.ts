// Prefs ke tests: galat ya khaali value par default, partner sirf sahi string par, theme sahi padha jaaye.
import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, parsePrefs } from "./prefs";

describe("parsePrefs", () => {
  it("khaali ho to default", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
  });

  it("kharab JSON ho to default", () => {
    expect(parsePrefs("{x")).toEqual(DEFAULT_PREFS);
  });

  it("partner aur large sahi se padhta hai, theme purani settings mein na ho to dark", () => {
    expect(parsePrefs(JSON.stringify({ role: "partner", textSize: "large" }))).toEqual({
      role: "partner",
      textSize: "large",
      theme: "dark",
    });
  });

  it("anjaani value user aur normal banti hai", () => {
    expect(parsePrefs(JSON.stringify({ role: "admin", textSize: "huge", theme: "neon" }))).toEqual(DEFAULT_PREFS);
  });

  it("theme ki sahi value padhi jaati hai", () => {
    expect(parsePrefs(JSON.stringify({ role: "user", textSize: "normal", theme: "eye_care" })).theme).toBe("eye_care");
    expect(parsePrefs(JSON.stringify({ theme: "system" })).theme).toBe("system");
  });
});