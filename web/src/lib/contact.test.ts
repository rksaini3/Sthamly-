// Contact link ke tests: 10 ank par 91, galat number par null.
import { describe, expect, it } from "vitest";
import { contactHref } from "./contact";

describe("contactHref", () => {
  it("10 ank ke Bharat number par 91 lagata hai", () => {
    expect(contactHref({ phone: "98765 43210" }, "call")).toBe("tel:+919876543210");
    expect(contactHref({ phone: "98765-43210" }, "whatsapp")).toBe("https://wa.me/919876543210");
  });

  it("number nahi to null", () => {
    expect(contactHref({ phone: null }, "call")).toBeNull();
  });

  it("chhota ya bahut lamba number null", () => {
    expect(contactHref({ phone: "123" }, "whatsapp")).toBeNull();
    expect(contactHref({ phone: "1".repeat(20) }, "call")).toBeNull();
  });
});