/**
 * Copy the CopilotKit v2 stylesheet into public/ so it can be served as a
 * plain static asset, loaded only when the copilot is enabled.
 *
 * Why not `import "@copilotkit/react-core/v2/styles.css"`: that file is
 * compiled with Tailwind v4 (native CSS cascade layers). Importing it routes
 * it through this app's Tailwind v3 PostCSS pipeline, which intercepts the
 * `@layer base` rules and fails the build ("`@layer base` is used but no
 * matching `@tailwind base` directive is present"). Serving it untouched
 * sidesteps the pipeline and keeps disabled deployments from downloading it
 * at all.
 *
 * Runs from the `prebuild` / `predev` npm hooks. Output is gitignored.
 */

import { copyFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const uiRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const source = join(
  uiRoot,
  "node_modules/@copilotkit/react-core/dist/v2/index.css",
)
const targetDir = join(uiRoot, "public/copilot")
const target = join(targetDir, "copilot-styles.css")

mkdirSync(targetDir, { recursive: true })
copyFileSync(source, target)
console.log(`[copy-copilot-css] ${source} -> ${target}`)
