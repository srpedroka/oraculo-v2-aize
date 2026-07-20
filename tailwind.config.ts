import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-muted": "var(--surface-muted)",
        "surface-subtle": "var(--surface-subtle)",
        "fill-hover": "var(--fill-hover)",
        "fill-active": "var(--fill-active)",
        "fill-press": "var(--fill-press)",
        border: "var(--border)",
        "border-subtle": "var(--border-subtle)",
        "border-control": "var(--border-control)",
        text: "var(--text)",
        "text-secondary": "var(--text-secondary)",
        "text-tertiary": "var(--text-tertiary)",
        "text-disabled": "var(--text-disabled)",
        accent: "var(--accent)",
        focus: "var(--focus)",
        "status-success": "var(--status-success)",
        "status-success-bg": "var(--status-success-bg)",
        "status-warning": "var(--status-warning)",
        "status-warning-bg": "var(--status-warning-bg)",
        "status-danger": "var(--status-danger)",
        "status-danger-bg": "var(--status-danger-bg)",
        "status-neutral": "var(--status-neutral)",
        "status-neutral-bg": "var(--status-neutral-bg)",
        "status-info": "var(--status-info)",
        "status-info-bg": "var(--status-info-bg)",
      },
      borderRadius: {
        small: "4px",
        control: "6px",
        card: "8px",
        overlay: "8px",
      },
      boxShadow: {
        card: "none",
        raised: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)",
        overlay: "0 16px 40px rgba(0,0,0,0.14)",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
      fontSize: {
        metric: ["32px", { lineHeight: "36px" }],
        "title-page": ["24px", { lineHeight: "32px" }],
        "title-lg": ["18px", { lineHeight: "26px" }],
        section: ["18px", { lineHeight: "26px" }],
        item: ["15px", { lineHeight: "22px" }],
        body: ["15px", { lineHeight: "23px" }],
        "body-compact": ["14px", { lineHeight: "20px" }],
        label: ["12px", { lineHeight: "18px" }],
        caption: ["12px", { lineHeight: "18px" }],
      },
      transitionDuration: {
        fast: "120ms",
        DEFAULT: "180ms",
        panel: "220ms",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.2, 0, 0, 1)",
        oracle: "cubic-bezier(0.22, 0.61, 0.36, 1)",
      },
      keyframes: {
        "page-in": {
          from: { opacity: "0", transform: "translateY(2px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pop-in": {
          from: { opacity: "0", transform: "translateY(2px) scale(.99)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "page-in": "page-in 180ms cubic-bezier(0.2, 0, 0, 1) both",
        "pop-in": "pop-in 180ms cubic-bezier(0.2, 0, 0, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
