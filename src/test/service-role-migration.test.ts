import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260714120000_service_role_baseline_grants.sql",
  "utf8",
).toLowerCase();

describe("baseline local do service_role", () => {
  it("mantem privilegios atuais e defaults futuros no schema public", () => {
    expect(migration).toContain("grant all privileges on all tables in schema public to service_role");
    expect(migration).toContain("grant all privileges on all sequences in schema public to service_role");
    expect(migration).toContain("grant execute on all functions in schema public to service_role");
    expect(migration).toContain("alter default privileges for role postgres in schema public");
    expect(migration).not.toMatch(/grant\s+all[^;]+\s+to\s+(anon|authenticated)/);
  });
});
