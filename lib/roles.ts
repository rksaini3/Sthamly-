import { ROLES, type Role } from "@/types/domain";

// हर भूमिका की जानकारी। live = false का मतलब "जल्द आएगा" दिखेगा।
// finance सिर्फ़ एडमिन को दिखती और चुनी जा सकती है (rolesFor देखें)।
export const ROLE_INFO: Record<Role, { label: string; hint: string; live: boolean }> = {
  shopkeeper: {
    label: "दुकानदार",
    hint: "पोस्टर और कैप्शन",
    live: true,
  },
  student: {
    label: "छात्र",
    hint: "पढ़ाई में मदद: नोट्स, सारांश, प्रश्नोत्तर",
    live: true,
  },
  creator: {
    label: "क्रिएटर",
    hint: "कैप्शन, हुक और hashtags",
    live: true,
  },
  ecommerce: {
    label: "ई-कॉमर्स सेलर",
    hint: "प्रोडक्ट लिस्टिंग, शीर्षक, विवरण, कीवर्ड और ऑफ़र का टेक्स्ट",
    live: true,
  },
  lawyer: {
    label: "वकील",
    hint: "कानूनी मसौदे और नोटिस (जल्द आएगा, अभी कानूनी सुरक्षा तैयार हो रही है)",
    live: false,
  },
  finance: {
    label: "फ़ाइनेंस शिक्षा (एडमिन)",
    hint: "शेयर और कंपनी विश्लेषण। केवल टीम के लिए, निजी।",
    live: true,
  },
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** इस user को कौन सी भूमिकाएं दिखें। finance सिर्फ़ एडमिन को। */
export function rolesFor(isAdmin: boolean): Role[] {
  return ROLES.filter((role) => role !== "finance" || isAdmin);
}