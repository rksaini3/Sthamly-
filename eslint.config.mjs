import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// eslint-config-next 16 खुद flat config देता है, इसलिए FlatCompat की ज़रूरत नहीं।
export default [
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "types/database.ts", "worker/**", "web/**", "shell/**"],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // नए React नियम (effect में setState, render में purity, apostrophe) की मौजूदा जगहें
    // अभी चेतावनी हैं, गलती नहीं। UI बदलने से पहले इन्हें अलग से ठीक किया जाएगा।
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
];