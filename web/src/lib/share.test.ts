// Sthamly AI web: share helper ke tests. Browser ki share API ke bina (Node mein) "unsupported" lautana chahiye.
import { afterEach, describe, expect, it, vi } from "vitest";
import { shareFromUrl } from "./share";

describe("shareFromUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("navigator.share na ho to unsupported", async () => {
    vi.stubGlobal("navigator", {});
    await expect(shareFromUrl("https://x.test/a", "a.md", "text/markdown", "T")).resolves.toBe("unsupported");
  });

  it("canShare false ho to unsupported", async () => {
    vi.stubGlobal("navigator", { share: vi.fn(), canShare: () => false });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("hi", { status: 200 })));
    await expect(shareFromUrl("https://x.test/a", "a.md", "text/markdown", "T")).resolves.toBe("unsupported");
  });

  it("user share band kare to cancelled, error nahi", async () => {
    const share = vi.fn(async () => {
      throw new DOMException("cancel", "AbortError");
    });
    vi.stubGlobal("navigator", { share, canShare: () => true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("hi", { status: 200 })));
    await expect(shareFromUrl("https://x.test/a", "a.md", "text/markdown", "T")).resolves.toBe("cancelled");
  });

  it("file bhejne par shared", async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { share, canShare: () => true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("hi", { status: 200 })));
    await expect(shareFromUrl("https://x.test/a", "a.md", "text/markdown", "T")).resolves.toBe("shared");
    expect(share).toHaveBeenCalledOnce();
  });
});
