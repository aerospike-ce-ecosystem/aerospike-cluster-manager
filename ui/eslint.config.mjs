import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { FlatCompat } from "@eslint/eslintrc"

const __dirname = dirname(fileURLToPath(import.meta.url))

// ESLint 9 flat config. `next lint` was removed in Next 15, so the lint scripts
// now call the ESLint CLI directly (see package.json). The Next.js shared
// config still ships as an eslintrc-style preset, so it is bridged into flat
// config with FlatCompat — the same shape create-next-app generates.
const compat = new FlatCompat({ baseDirectory: __dirname })

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "next-env.d.ts",
      "public/**",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
]

export default eslintConfig
