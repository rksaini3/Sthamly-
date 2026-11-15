import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Capacitor फ़ाइलें APK के अंदर से लोड करता है, इसलिए paths relative होने चाहिए
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});