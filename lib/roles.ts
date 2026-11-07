import { ROLES, type Role } from "@/types/domain";

// हर भूमिका की जानकारी। live = false का मतलब "जल्द आएगा" दिखेगा।
export const ROLE_INFO: Record<Role, { label: string; hint: string; live: boolean }> = {
  shopkeeper: {
    label: "दुकानदार",
    hint: "पोस्टर, कैप्शन और रील",
    live: true,
  },
  student: {
    label: "छात्र",
    hint: "पढ़ाई में मदद: नोट्स, सारांश, प्रश्नोत्तर",
    live: false,
  },
  creator: {
    label: "क्रिएटर",
    hint: "रील के हुक, कैप्शन और hashtags",
    live: false,
  },
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}