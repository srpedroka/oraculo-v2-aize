import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

describe("CI workflow contract", () => {
  it("usa permissoes minimas e produz um gate estavel", () => {
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("ci-required:");
    expect(workflow).toContain("needs: [quality, integration]");
  });

  it("executa todos os gates obrigatorios", () => {
    for (const command of [
      "pnpm install --frozen-lockfile",
      "pnpm run ci:secret-scan",
      "pnpm run ci:audit",
      "pnpm run lint",
      "pnpm run test:unit",
      "pnpm run test:integration",
      "pnpm run test:security",
      "pnpm run build",
      "pnpm run test:e2e:staging",
    ]) {
      expect(workflow).toContain(command);
    }
  });

  it("usa Supabase local e envia apenas logs sanitizados em falha", () => {
    expect(workflow).toContain("supabase start");
    expect(workflow).toContain("SUPABASE_STAGING_DB_URL");
    expect(workflow).toContain("if: failure()");
    expect(workflow).toContain("ci-artifacts");
    expect(workflow).not.toContain("bkswkfazkjilwfzwzthz");
    expect(workflow).not.toContain("SUPABASE_ACCESS_TOKEN");
  });
});
