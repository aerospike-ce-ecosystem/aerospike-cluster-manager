/**
 * Copy the CopilotKit v2 stylesheet into public/ so it can be served as a
 * plain static asset, loaded only when the copilot is enabled.
 *
 * Why not `import "@copilotkit/react-core/v2/styles.css"`: that file is
 * compiled with Tailwind v4 and routed through this app's Tailwind v3
 * PostCSS pipeline it fails the build ("`@layer base` is used but no
 * matching `@tailwind base` directive is present").
 *
 * Why the @layer unwrapping: every rule in the file sits inside CSS cascade
 * layers (properties/theme/base/utilities). Per the cascade spec, layered
 * rules ALWAYS lose to un-layered rules of the same origin — and this app's
 * own Tailwind v3 globals are un-layered, so they override CopilotKit's
 * styling and the chat renders half-unstyled. Unwrapping is safe because
 * the rules are already scoped: `base` targets [data-copilotkit] subtrees
 * and `utilities` uses `.cpk\:`-prefixed classes. The one global rule (the
 * `@layer properties` custom-property fallback on `*`) is re-scoped under
 * [data-copilotkit] so it cannot leak into the app.
 *
 * Runs from the `prebuild` / `predev` npm hooks. Output is gitignored.
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import postcss from "postcss"

const uiRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const source = join(
  uiRoot,
  "node_modules/@copilotkit/react-core/dist/v2/index.css",
)
const targetDir = join(uiRoot, "public/copilot")
const target = join(targetDir, "copilot-styles.css")

function scopeSelector(selector) {
  return selector
    .split(",")
    .map((part) => {
      const sel = part.trim()
      if (sel === "*") return "[data-copilotkit], [data-copilotkit] *"
      // ::before / ::backdrop etc. on the universal selector
      return `[data-copilotkit] ${sel}, [data-copilotkit]${sel}`
    })
    .join(", ")
}

const root = postcss.parse(readFileSync(source, "utf8"))

root.walkAtRules("layer", (atRule) => {
  if (!atRule.nodes) {
    // bare `@layer components;` statement — drop it
    atRule.remove()
    return
  }
  if (atRule.params === "properties") {
    // The custom-property fallback block targets `*` — scope it to
    // CopilotKit subtrees before unwrapping so it cannot leak.
    atRule.walkRules((rule) => {
      rule.selector = scopeSelector(rule.selector)
    })
  }
  atRule.replaceWith(atRule.nodes)
})

mkdirSync(targetDir, { recursive: true })
writeFileSync(target, root.toString())
console.log(`[copy-copilot-css] ${source} -> ${target} (layers unwrapped)`)
