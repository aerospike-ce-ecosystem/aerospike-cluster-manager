/**
 * Semantic color palette for `env` label values.
 *
 * Rationale: an `env` label is the strongest grouping axis on the cluster
 * list, so it deserves a distinct hue per value (production = danger,
 * stage = caution, test = info, dev = active, default = neutral). Returned
 * tokens are Tailwind class strings — kept as strings (not objects) so the
 * JIT compiler can statically extract them.
 */

export const ENV_TONES = {
  prod: {
    accent: "bg-rose-500",
    headerText: "text-rose-700 dark:text-rose-400",
    rule: "bg-gradient-to-r from-rose-300/80 via-rose-200/40 to-transparent dark:from-rose-700/50 dark:via-rose-800/20",
    valueBg: "bg-rose-50 dark:bg-rose-950/40",
    valueText: "text-rose-700 dark:text-rose-300",
    valueRing: "ring-rose-200 dark:ring-rose-900/60",
  },
  stage: {
    accent: "bg-amber-500",
    headerText: "text-amber-700 dark:text-amber-400",
    rule: "bg-gradient-to-r from-amber-300/80 via-amber-200/40 to-transparent dark:from-amber-700/50 dark:via-amber-800/20",
    valueBg: "bg-amber-50 dark:bg-amber-950/40",
    valueText: "text-amber-800 dark:text-amber-300",
    valueRing: "ring-amber-200 dark:ring-amber-900/60",
  },
  test: {
    accent: "bg-sky-500",
    headerText: "text-sky-700 dark:text-sky-400",
    rule: "bg-gradient-to-r from-sky-300/80 via-sky-200/40 to-transparent dark:from-sky-700/50 dark:via-sky-800/20",
    valueBg: "bg-sky-50 dark:bg-sky-950/40",
    valueText: "text-sky-700 dark:text-sky-300",
    valueRing: "ring-sky-200 dark:ring-sky-900/60",
  },
  dev: {
    accent: "bg-emerald-500",
    headerText: "text-emerald-700 dark:text-emerald-400",
    rule: "bg-gradient-to-r from-emerald-300/80 via-emerald-200/40 to-transparent dark:from-emerald-700/50 dark:via-emerald-800/20",
    valueBg: "bg-emerald-50 dark:bg-emerald-950/40",
    valueText: "text-emerald-700 dark:text-emerald-300",
    valueRing: "ring-emerald-200 dark:ring-emerald-900/60",
  },
  default: {
    accent: "bg-slate-400 dark:bg-slate-500",
    headerText: "text-slate-600 dark:text-slate-300",
    rule: "bg-gradient-to-r from-slate-300/80 via-slate-200/40 to-transparent dark:from-slate-700/50 dark:via-slate-800/20",
    valueBg: "bg-slate-100 dark:bg-slate-900",
    valueText: "text-slate-700 dark:text-slate-300",
    valueRing: "ring-slate-200 dark:ring-slate-800",
  },
} as const

export type EnvTone = (typeof ENV_TONES)[keyof typeof ENV_TONES]

export function getEnvTone(env: string): EnvTone {
  const key = env.toLowerCase()
  if (key in ENV_TONES) {
    return ENV_TONES[key as keyof typeof ENV_TONES]
  }
  return ENV_TONES.default
}
