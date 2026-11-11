import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // native package, bundle में नहीं जाना चाहिए (पोस्टर रेंडर के लिए)
  serverExternalPackages: ["@resvg/resvg-js"],
  // हिंदी फ़ॉन्ट की फ़ाइल API functions के साथ पैक हो, ताकि पोस्टर बनते समय मिले
  outputFileTracingIncludes: {
    "/api/**/*": ["./public/fonts/**/*"],
  },
};

export default config;