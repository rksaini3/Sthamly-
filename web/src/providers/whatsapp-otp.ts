import { describe, expect, it } from "vitest";
import { buildOtpPayload } from "./whatsapp-otp";

const base = { phone: "919876543210", otp: "482913", template: "sthamly_otp", lang: "hi" };

describe("buildOtpPayload", () => {
  it("copy button ke saath OTP body aur button dono mein jaata hai", () => {
    const p = buildOtpPayload({ ...base, copyButton: true }) as {
      template: { components: Array<{ type: string; sub_type?: string; index?: string; parameters: unknown[] }> };
    };
    const comps = p.template.components;
    expect(comps).toHaveLength(2);
    expect(comps[0]).toEqual({ type: "body", parameters: [{ type: "text", text: "482913" }] });
    expect(comps[1]).toEqual({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: "482913" }],
    });
  });

  it("copy button band ho to sirf body jaati hai", () => {
    const p = buildOtpPayload({ ...base, copyButton: false }) as {
      template: { components: unknown[] };
    };
    expect(p.template.components).toHaveLength(1);
  });

  it("messaging fields, template naam aur language sahi", () => {
    const p = buildOtpPayload({ ...base, copyButton: true }) as {
      messaging_product: string;
      to: string;
      type: string;
      template: { name: string; language: { code: string } };
    };
    expect(p.messaging_product).toBe("whatsapp");
    expect(p.to).toBe("919876543210");
    expect(p.type).toBe("template");
    expect(p.template.name).toBe("sthamly_otp");
    expect(p.template.language.code).toBe("hi");
  });
});
