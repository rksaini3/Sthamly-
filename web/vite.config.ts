// Sthamly AI web — Vite config (Blueprint 3.0, section 10)
// Dev: /api aur /health ki requests local Worker (wrangler dev, port 8787) par jaati hain.
// Production: build sirf static files banata hai (Vercel par host, Capacitor ke liye bhi).
// Koi secret yahan nahi. Sirf VITE_ prefix wale public variables app tak jaate hain.

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const WORKER_DEV_URL = "http://localhost:8787";

export default defineConfig(({ mode }) => {
  // .env.* files se VITE_ variables. Sirf public values: API base, Supabase URL, anon key.
  const env = loadEnv(mode, process.cwd(), "VITE_");

  return {
    plugins: [react()],

    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: env.VITE_WORKER_DEV_URL || WORKER_DEV_URL,
          changeOrigin: true,
          secure: false,
        },
        "/health": {
          target: env.VITE_WORKER_DEV_URL || WORKER_DEV_URL,
          changeOrigin: true,
          secure: false,
        },
      },
    },

    build: {
      outDir: "dist",
      sourcemap: false,
      target: "es2022",
      // Capacitor WebView ke liye: assets relative paths se load hon
      chunkSizeWarningLimit: 900,
    },

    // Preview bhi dev jaisi proxy use kare
    preview: {
      port: 4173,
      strictPort: true,
    },
  };
});