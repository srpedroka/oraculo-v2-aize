import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260714190000_s4_operational_safety.sql", "utf8");
const lifecycle = readFileSync("supabase/functions/organization-lifecycle/index.ts", "utf8");
const health = readFileSync("supabase/functions/_shared/operational-health.ts", "utf8");
const backup = readFileSync("supabase/functions/_shared/organization-backup.ts", "utf8");

describe("S4 operational safety", () => {
  it("keeps safety events service-only and auditable", () => {
    expect(migration).toContain("alter table public.operational_safety_events enable row level security");
    expect(migration).toContain("revoke all on public.operational_safety_events from public, anon, authenticated");
    expect(migration).toContain("record_destructive_schema_change");
  });

  it("distinguishes monthly restores from quarterly disaster drills", () => {
    expect(migration).toContain("'monthly_drill', 'disaster_drill'");
    expect(health).toContain("lastDisasterDrillAgeDays > 100");
    expect(health).toContain("lastRestoreAgeDays > 35");
    expect(backup).toContain('exercise_type: input.exerciseType ?? "restore"');
  });

  it("requires the final server-side deletion confirmation", () => {
    const confirmation = lifecycle.indexOf("payload.finalConfirmation !== true");
    const deletion = lifecycle.indexOf('client.rpc("delete_organization_permanently"');
    expect(confirmation).toBeGreaterThan(0);
    expect(deletion).toBeGreaterThan(confirmation);
  });
});
