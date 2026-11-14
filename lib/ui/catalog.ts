import { z } from "zod";
import { ROLES, type Role } from "@/types/domain";

// ---- Widgets: यही पूरी सूची है। Agent नया widget नहीं बना सकता, सिर्फ़ इनमें से चुन सकता है। ----

export const WIDGET_TYPES = [
  "quick_actions", // बड़े बटन: नया पोस्टर, हाल के काम, आदि
  "recent_posters", // हाल के पोस्टर की स्थिति
  "festivals", // आने वाले त्योहार और सुझाव
  "tip_card", // एक छोटी सलाह या सूचना
] as const;

export type WidgetType = (typeof WIDGET_TYPES)[number];

export interface WidgetInfo {
  label: { hi: string; en: string };
  // इस widget को कौन-कौन सी भूमिकाएँ देख सकती हैं
  roles: readonly Role[];
  // true हो तो user इसे छिपा नहीं सकता (जैसे कानूनी या अनुपालन की सूचना)
  mandatory: boolean;
}

export const WIDGET_INFO: Record<WidgetType, WidgetInfo> = {
  quick_actions: {
    label: { hi: "त्वरित काम", en: "Quick actions" },
    roles: ROLES,
    mandatory: false,
  },
  recent_posters: {
    label: { hi: "हाल के पोस्टर", en: "Recent posters" },
    roles: ["shopkeeper", "creator"],
    mandatory: false,
  },
  festivals: {
    label: { hi: "आने वाले त्योहार", en: "Upcoming festivals" },
    roles: ["shopkeeper", "creator"],
    mandatory: false,
  },
  tip_card: {
    label: { hi: "सलाह", en: "Tip" },
    roles: ROLES,
    // finance की अनुपालन सूचना और वकील की "यह कानूनी सलाह नहीं है" सूचना हमेशा दिखेगी
    mandatory: true,
  },
};

// ---- Layout: एक user के लिए widgets का क्रम और पसंद ----

export interface LayoutItem {
  type: WidgetType;
  hidden: boolean;
  pinned: boolean;
}

export const LayoutItemSchema = z.object({
  type: z.enum(WIDGET_TYPES),
  hidden: z.boolean().default(false),
  pinned: z.boolean().default(false),
});

// Agent या user से आया layout: पहले से सख़्त जाँच, अनजान widget सीधे रद्द
export const LayoutSchema = z.object({
  items: z.array(LayoutItemSchema).min(1).max(WIDGET_TYPES.length),
});

// ---- Defaults: हर भूमिका के लिए शुरुआती layout ----

const DEFAULT_ORDER: Record<Role, WidgetType[]> = {
  shopkeeper: ["quick_actions", "festivals", "recent_posters", "tip_card"],
  creator: ["quick_actions", "recent_posters", "festivals", "tip_card"],
  student: ["quick_actions", "tip_card"],
  lawyer: ["quick_actions", "tip_card"],
  finance: ["quick_actions", "tip_card"],
};

/** भूमिका के हिसाब से शुरुआती layout। सिर्फ़ वही widgets जो उस भूमिका को दिख सकें। */
export function defaultLayout(role: Role): LayoutItem[] {
  return DEFAULT_ORDER[role]
    .filter((type) => WIDGET_INFO[type].roles.includes(role))
    .map((type) => ({ type, hidden: false, pinned: false }));
}

/**
 * user की सेव की हुई पसंद को शुरुआती layout पर लगाएं।
 * - अनजान या अब न दिखने वाले widget छोड़ दिए जाते हैं
 * - mandatory widget कभी छिपता नहीं
 * - जो widget user की पसंद में नहीं, वह आख़िर में शुरुआती क्रम से जुड़ता है
 */
export function mergeLayout(role: Role, saved: unknown): LayoutItem[] {
  const base = defaultLayout(role);
  const parsed = LayoutSchema.safeParse(saved);
  if (!parsed.success) return base;

  const allowed = new Set(base.map((i) => i.type));
  const picked: LayoutItem[] = [];
  const seen = new Set<WidgetType>();

  for (const item of parsed.data.items) {
    if (!allowed.has(item.type) || seen.has(item.type)) continue;
    seen.add(item.type);
    picked.push({
      type: item.type,
      hidden: WIDGET_INFO[item.type].mandatory ? false : item.hidden,
      pinned: item.pinned,
    });
  }

  // जो widget user की सूची में नहीं था, उसे शुरुआती क्रम से पीछे जोड़ें
  for (const item of base) {
    if (!seen.has(item.type)) picked.push(item);
  }

  // पिन किए widgets सबसे ऊपर, बाकी अपने क्रम में
  return [...picked.filter((i) => i.pinned), ...picked.filter((i) => !i.pinned)];
}

/** किसी user को कौन सा widget दिखेगा (छिपे हुए छोड़कर)। */
export function visibleWidgets(layout: LayoutItem[]): LayoutItem[] {
  return layout.filter((i) => !i.hidden);
}