import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-muted": "var(--surface-muted)",
        "fill-hover": "var(--fill-hover)",
        "fill-active": "var(--fill-active)",
        "fill-press": "var(--fill-press)",
        border: "var(--border)",
        text: "var(--text)",
        "text-secondary": "var(--text-secondary)",
        "text-tertiary": "var(--text-tertiary)",
        accent: "var(--accent)",
        "status-success": "var(--status-success)",
        "status-success-bg": "var(--status-success-bg)",
        "status-warning": "var(--status-warning)",
        "status-warning-bg": "var(--status-warning-bg)",
        "status-danger": "var(--status-danger)",
        "status-danger-bg": "var(--status-danger-bg)",
      },
      borderRadius: {
        control: "10px",
        card: "16px",
        overlay: "20px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)",
        raised: "0 2px 4px rgba(0,0,0,0.04), 0 6px 16px rgba(0,0,0,0.08)",
        overlay: "0 12px 32px rgba(0,0,0,0.12)",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
      fontSize: {
        metric: ["34px", { lineHeight: "1" }],
        "title-lg": ["20px", { lineHeight: "1.15" }],
        body: ["15px", { lineHeight: "1.5" }],
        label: ["13px", { lineHeight: "1.35" }],
      },
      transitionDuration: {
        DEFAULT: "160ms",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.2, 0, 0, 1)",
        oracle: "cubic-bezier(0.22, 0.61, 0.36, 1)",
      },
      keyframes: {
        "page-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pop-in": {
          from: { opacity: "0", transform: "translateY(4px) scale(.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "page-in": "page-in 180ms cubic-bezier(0.22, 0.61, 0.36, 1) both",
        "pop-in": "pop-in 160ms cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
