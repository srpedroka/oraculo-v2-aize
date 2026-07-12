import { defineConfig } from "vitest/config";

// Testes de integração — usam SOMENTE o Supabase de staging (nunca produção).
// Precisam de SUPABASE_STAGING_PROJECT_REF e SUPABASE_STAGING_ACCESS_TOKEN no ambiente.
// Enquanto não houver testes (antes da Fatia 0C), passWithNoTests mantém o pipeline verde.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],
    passWithNoTests: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
