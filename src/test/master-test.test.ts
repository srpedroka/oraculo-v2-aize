import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/master-test.ts", "utf8");
const functionalScript = readFileSync("scripts/master-test-functional.ts", "utf8");
const failureScript = readFileSync("scripts/master-test-failures.ts", "utf8");
const packageJson = readFileSync("package.json", "utf8");

describe("Teste Mestre final", () => {
  it("mantém estado e credenciais somente na pasta privada", () => {
    expect(script).toContain('.agents-private/master-test-7a.json');
    expect(script).toContain("mode: 0o600");
    expect(functionalScript).toContain('.agents-private/master-test-7b.json');
    expect(functionalScript).toContain("mode: 0o600");
    expect(failureScript).toContain('.agents-private/master-test-7c.json');
    expect(failureScript).toContain("mode: 0o600");
    expect(failureScript).toContain("chmod(REPORT_PATH, 0o600)");
    expect(script).not.toMatch(/console\.log\([^)]*(password|secret)/i);
    expect(functionalScript).not.toMatch(/console\.log\([^)]*(password|secret)/i);
    expect(failureScript).not.toMatch(/console\.log\([^)]*(password|secret)/i);
  });

  it("recusa produção e oferece setup, verificação e limpeza explícitos", () => {
    expect(script).toContain('if (!ref || ref === PRODUCTION_REF)');
    expect(functionalScript).toContain('if (!ref || ref === PRODUCTION_REF)');
    expect(failureScript).toContain('if (!ref || ref === PRODUCTION_REF)');
    expect(script).toContain("await cleanupResources(created)");
    expect(packageJson).toContain('"test:master:setup"');
    expect(packageJson).toContain('"test:master:verify"');
    expect(packageJson).toContain('"test:master:functional"');
    expect(packageJson).toContain('"test:master:failures"');
    expect(packageJson).toContain('"test:master:cleanup"');
  });

  it("prepara o baseline sem habilitar WhatsApp real nem bloquear a IA", () => {
    expect(script).toContain('mode: "monitor" as const');
    expect(script).toContain('mode: "synthetic_staging"');
    expect(script).toContain("realInstanceConfigured: false");
    expect(script).not.toContain("whatsapp_instance_keys\").insert");
  });
});
