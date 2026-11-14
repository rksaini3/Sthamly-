import type { Role } from "@/types/domain";
import { lawyerPack } from "@/lib/packs/lawyer";
import type { DomainPack, PackRegistry } from "@/lib/packs/types";

// सभी packs एक जगह। नया pack जोड़ना = यहां एक पंक्ति।
// जिस भूमिका का pack न हो, उसके लिए null मिलेगा और सामान्य सवाल-जवाब चलेगा।
const REGISTRY: PackRegistry = {
  lawyer: lawyerPack,
};

/** भूमिका का pack। न मिले तो null (सामान्य chat इस्तेमाल होगी)। */
export function packFor(role: Role | null | undefined): DomainPack | null {
  if (!role) return null;
  return REGISTRY[role] ?? null;
}

/** क्या इस भूमिका का कोई pack है? (UI में "जल्द आएगा" और pack वाली भूमिकाओं में फ़र्क के लिए) */
export function hasPack(role: Role | null | undefined): boolean {
  return packFor(role) !== null;
}

/** सिर्फ़ जांच के लिए: कौन-कौन सी भूमिकाओं के pack हैं। */
export function packedRoles(): Role[] {
  return (Object.keys(REGISTRY) as Role[]).filter((r) => REGISTRY[r] !== undefined);
}