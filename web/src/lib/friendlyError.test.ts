// Friendly error ke tests: code ya technical text kabhi message mein nahi, aur sahi kadam.
import { describe, expect, it } from "vitest";
import { ApiClientError, NETWORK_MESSAGE } from "../api/client";
import { autoRetryDelay, friendlyFromApi, friendlyFromMic } from "./friendlyError";

describe("friendlyFromApi", () => {
  it("503 jaisi seva-vyast: thodi der mein + auto retry, code nahi dikhta", () => {
    const info = friendlyFromApi(new ApiClientError("provider_unavailable", "x", true, "req"));
    expect(info.kind).toBe("busy");
    expect(info.message).toContain("थोड़ी देर");
    expect(info.autoRetry).toBe(true);
    expect(info.message).not.toMatch(/provider_unavailable|503|groq|gemini/i);
  });

  it("daily limit: 'कल सुबह' aur baaki features chalne ka bharosa", () => {
    const info = friendlyFromApi(new ApiClientError("budget_exceeded", "x", false, null));
    expect(info.kind).toBe("limit");
    expect(info.message).toContain("कल सुबह फिर");
    expect(info.canRetry).toBe(false);
  });

  it("net nahi: 'संदेश सुरक्षित' wala vakya", () => {
    const info = friendlyFromApi(new ApiClientError("internal", NETWORK_MESSAGE, true, null));
    expect(info.kind).toBe("offline");
    expect(info.message).toBe("नेट कमज़ोर है, संदेश सुरक्षित है, जुड़ते ही भेजेंगे।");
    expect(info.canRetry).toBe(true);
  });

  it("login chahiye to login kind", () => {
    expect(friendlyFromApi(new ApiClientError("unauthenticated", "x", false, null)).kind).toBe("login");
  });

  it("anjaan error: saaf Hindi fallback", () => {
    const info = friendlyFromApi(new Error("ECONNRESET stack trace"));
    expect(info.kind).toBe("other");
    expect(info.message).not.toContain("ECONNRESET");
  });
});

describe("friendlyFromMic", () => {
  it("mic permission: chitra wali madad aur likhne ka rasta", () => {
    const info = friendlyFromMic("permission_denied");
    expect(info.kind).toBe("mic_denied");
    expect(info.showMicHelp).toBe(true);
    expect(info.offerTyping).toBe(true);
  });

  it("khaali transcript: 'फिर से बोलिए' aur typing option", () => {
    const info = friendlyFromMic("empty");
    expect(info.title).toBe("फिर से बोलिए");
    expect(info.offerTyping).toBe(true);
  });

  it("anjaan mic code bhi fallback deta hai", () => {
    expect(friendlyFromMic(undefined).kind).toBe("mic_unclear");
  });
});

describe("autoRetryDelay", () => {
  it("do baar tak delay, phir null", () => {
    expect(autoRetryDelay(0)).toBe(5000);
    expect(autoRetryDelay(1)).toBe(15000);
    expect(autoRetryDelay(2)).toBeNull();
    expect(autoRetryDelay(-1)).toBeNull();
  });
});