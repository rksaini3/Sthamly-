import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // native binary वाला package, bundle न करें
  serverExternalPackages: ["@resvg/resvg-js"],
};

export default nextConfig;
