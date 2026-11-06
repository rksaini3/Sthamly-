import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "types/database.ts"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];