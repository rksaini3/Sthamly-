import type { MetadataRoute } from "next";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://sthamly.com").replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // निजी पन्ने और API: इन्हें खोज में दिखाने की ज़रूरत नहीं
        disallow: [
          "/api/",
          "/auth/",
          "/account",
          "/my-posters",
          "/notebook",
          "/notifications",
          "/settings",
          "/onboarding",
          "/dashboard",
          "/batch",
          "/images",
          "/live",
          "/home",
          "/role",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}