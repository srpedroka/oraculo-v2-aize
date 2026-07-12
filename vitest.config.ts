import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Testes unitários e de componente (jsdom). Não tocam banco nem rede.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "supabase/functions/**/*.test.ts"],
    exclude: ["tests/**", "node_modules/**", "dist/**"],
    passWithNoTests: false,
  },
});
