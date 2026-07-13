import { describe, expect, it } from "vitest";
import { findSecretFindings, isForbiddenTrackedPath, sanitizeCiOutput } from "../../scripts/ci-checks";

describe("CI security checks", () => {
  it("recusa arquivos sensiveis e preserva o exemplo publico", () => {
    expect(isForbiddenTrackedPath(".env.production")).toBe(true);
    expect(isForbiddenTrackedPath("backup.sql.gz")).toBe(true);
    expect(isForbiddenTrackedPath(".env.example")).toBe(false);
  });

  it("detecta credenciais de alta confianca", () => {
    const personalToken = `sbp_${"a".repeat(40)}`;
    const apiKey = `sk-${"b".repeat(40)}`;
    expect(findSecretFindings("config.txt", `${personalToken}\n${apiKey}`).map((item) => item.rule)).toEqual([
      "supabase-personal-token",
      "provider-api-key",
    ]);
  });

  it("nao acusa placeholders documentados", () => {
    const value = `SUPABASE_ACCESS_TOKEN=sbp_${"x".repeat(40)} # placeholder`;
    expect(findSecretFindings(".env.example", value)).toEqual([]);
  });

  it("remove segredo, JWT e email dos artefatos", () => {
    const secret = "sensitive-value-123";
    const jwt = `${`eyJ${"a".repeat(20)}`}.${"b".repeat(24)}.${"c".repeat(24)}`;
    const output = sanitizeCiOutput(`token=${secret} jwt=${jwt} user=e2e@example.com`, [secret]);
    expect(output).not.toContain(secret);
    expect(output).not.toContain(jwt);
    expect(output).not.toContain("e2e@example.com");
    expect(output).toContain("[REDACTED]");
  });
});
