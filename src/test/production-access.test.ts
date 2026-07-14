import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/production-access.ts", "utf8");
const envExample = readFileSync(".agents-private/agent-env.example", "utf8");

describe("protected production access", () => {
  it("does not keep the production management token in agent-env", () => {
    expect(envExample).not.toMatch(/^SUPABASE_ACCESS_TOKEN=/m);
  });

  it("exposes only verify and explicit function deployment", () => {
    expect(script).toContain('action === "verify"');
    expect(script).toContain('action === "functions"');
    expect(script).not.toContain("database/query");
    expect(script).not.toContain("eval(");
    expect(script).not.toContain('spawnSync("sh"');
  });
});
