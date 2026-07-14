import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const productionWorkflow = readFileSync(".github/workflows/production-release.yml", "utf8");

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

describe("protected production workflow contract", () => {
  it("gates the exact SHA on CI required before opening production", () => {
    expect(productionWorkflow).toContain("Preflight without production secrets");
    expect(productionWorkflow).toContain('name == \"CI required\"');
    expect(productionWorkflow).toContain("git merge-base --is-ancestor");
    const preflight = productionWorkflow.slice(0, productionWorkflow.indexOf("  verify-production:"));
    expect(preflight).not.toContain("secrets.SUPABASE_ACCESS_TOKEN");
    expect(preflight).not.toContain("secrets.SUPABASE_DB_PASSWORD");
  });

  it("uses the protected environment only for production access", () => {
    expect(productionWorkflow.match(/environment: production/g)).toHaveLength(3);
    expect(productionWorkflow).toContain("Read-only production verification");
    expect(productionWorkflow).toContain("Deploy explicit Edge Functions");
    expect(productionWorkflow).toContain("Deploy guarded migrations");
  });

  it("keeps destructive migrations opt-in", () => {
    expect(productionWorkflow).toContain("allow_destructive_migration");
    expect(productionWorkflow).toContain("production-release-guard.ts migrations");
    expect(productionWorkflow).toContain("pending-production-migrations.ts");
    expect(productionWorkflow).toContain("migration pendente fora do pacote aprovado");
    expect(productionWorkflow).toContain("--allow-destructive");
  });
});
