import { defineConfig } from "vitest/config";

// Testes de segurança (RLS): comprovam isolamento entre organizações no staging.
// Usam SOMENTE o Supabase de staging (nunca produção).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/security/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],
    passWithNoTests: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
