/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Vercel वाला API का पता, जैसे https://sthamly.com (build से पहले set करें)
  readonly VITE_API_BASE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}