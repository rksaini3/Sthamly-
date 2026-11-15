import type { MetadataRoute } from "next";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://sthamly.com").replace(/\/+$/, "");

// सिर्फ़ वे पन्ने जो बिना लॉग-इन के खुलते हैं। निजी पन्ने (खाता, मेरे पोस्टर आदि) यहाँ नहीं।
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/voice`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/pricing`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
}