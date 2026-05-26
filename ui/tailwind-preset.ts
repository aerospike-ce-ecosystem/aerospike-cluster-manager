import type { Config } from "tailwindcss"

/**
 * ACM Tailwind preset — maps the design tokens in src/styles/tokens.css to
 * Tailwind utilities (primary/neutral/semantic colors, font tokens, spacing,
 * radius, shadow, motion). Pure token mapping; no component classes here —
 * those live in src/styles/theme.css.
 */
const preset: Partial<Config> = {
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        primary: {
          10: "var(--primary-10)",
          30: "var(--primary-30)",
          40: "var(--primary-40)",
          45: "var(--primary-45)",
          50: "var(--primary-50)",
          55: "var(--primary-55)",
          65: "var(--primary-65)",
          80: "var(--primary-80)",
          90: "var(--primary-90)",
          95: "var(--primary-95)",
          DEFAULT: "var(--primary-50)",
        },
        neutral: {
          4: "var(--neutral-4)",
          9: "var(--neutral-9)",
          12: "var(--neutral-12)",
          15: "var(--neutral-15)",
          18: "var(--neutral-18)",
          21: "var(--neutral-21)",
          24: "var(--neutral-24)",
          29: "var(--neutral-29)",
          32: "var(--neutral-32)",
          40: "var(--neutral-40)",
          45: "var(--neutral-45)",
          50: "var(--neutral-50)",
          60: "var(--neutral-60)",
          65: "var(--neutral-65)",
          70: "var(--neutral-70)",
          78: "var(--neutral-78)",
          80: "var(--neutral-80)",
          90: "var(--neutral-90)",
          92: "var(--neutral-92)",
          95: "var(--neutral-95)",
          97: "var(--neutral-97)",
          98: "var(--neutral-98)",
          100: "var(--neutral-100)",
        },
        error: {
          30: "var(--error-30)",
          40: "var(--error-40)",
          45: "var(--error-45)",
          50: "var(--error-50)",
          55: "var(--error-55)",
          DEFAULT: "var(--error-50)",
        },
        warning: {
          30: "var(--warning-30)",
          40: "var(--warning-40)",
          45: "var(--warning-45)",
          50: "var(--warning-50)",
          55: "var(--warning-55)",
          DEFAULT: "var(--warning-50)",
        },
        positive: {
          30: "var(--positive-30)",
          40: "var(--positive-40)",
          45: "var(--positive-45)",
          50: "var(--positive-50)",
          55: "var(--positive-55)",
          DEFAULT: "var(--positive-50)",
        },
        bg: {
          DEFAULT: "var(--bg)",
          subtle: "var(--bg-subtle)",
          low: "var(--bg-low)",
        },
        surface: {
          DEFAULT: "var(--surface)",
          container: "var(--surface-container)",
          "container-low": "var(--surface-container-low)",
          "container-high": "var(--surface-container-high)",
          "container-highest": "var(--surface-container-highest)",
          inverse: "var(--surface-inverse)",
        },
        "on-surface": {
          DEFAULT: "var(--on-surface)",
          variant: "var(--on-surface-variant)",
          muted: "var(--on-surface-muted)",
          disabled: "var(--on-surface-disabled)",
        },
        border: {
          DEFAULT: "var(--border)",
          subtle: "var(--border-subtle)",
        },
        divider: "var(--divider)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        "micro-md": ["var(--fs-micro-md)", { lineHeight: "var(--lh-tight)" }],
        "micro-lg": ["var(--fs-micro-lg)", { lineHeight: "var(--lh-tight)" }],
        "body-xs": ["var(--fs-body-xs)", { lineHeight: "var(--lh-body)" }],
        "body-sm": ["var(--fs-body-sm)", { lineHeight: "var(--lh-body)" }],
        "body-md": ["var(--fs-body-md)", { lineHeight: "var(--lh-body)" }],
        "body-lg": ["var(--fs-body-lg)", { lineHeight: "var(--lh-body)" }],
        "title-xs": ["var(--fs-title-xs)", { lineHeight: "var(--lh-title)" }],
        "title-sm": ["var(--fs-title-sm)", { lineHeight: "var(--lh-title)" }],
        "title-md": ["var(--fs-title-md)", { lineHeight: "var(--lh-title)" }],
        "title-lg": ["var(--fs-title-lg)", { lineHeight: "var(--lh-title)" }],
        "title-xl": ["var(--fs-title-xl)", { lineHeight: "var(--lh-title)" }],
        "headline-xs": [
          "var(--fs-headline-xs)",
          { lineHeight: "var(--lh-headline)" },
        ],
        "headline-sm": [
          "var(--fs-headline-sm)",
          { lineHeight: "var(--lh-headline)" },
        ],
        "headline-md": [
          "var(--fs-headline-md)",
          { lineHeight: "var(--lh-headline)" },
        ],
        "headline-lg": [
          "var(--fs-headline-lg)",
          { lineHeight: "var(--lh-headline)" },
        ],
      },
      spacing: {
        1: "var(--space-1)",
        2: "var(--space-2)",
        3: "var(--space-3)",
        4: "var(--space-4)",
        5: "var(--space-5)",
        6: "var(--space-6)",
        8: "var(--space-8)",
        10: "var(--space-10)",
        12: "var(--space-12)",
        16: "var(--space-16)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        bubble: "var(--radius-bubble)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
        slow: "var(--duration-slow)",
      },
      transitionTimingFunction: {
        default: "var(--easing-default)",
        enter: "var(--easing-enter)",
        exit: "var(--easing-exit)",
      },
    },
  },
}

export default preset
