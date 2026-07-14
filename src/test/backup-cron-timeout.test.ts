import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260714160000_backup_cron_timeout.sql",
  "utf8",
);

describe("cron de backup", () => {
  it("aguarda backups reais sem usar o timeout curto do pg_net", () => {
    expect(migration).toContain("timeout_milliseconds := 300000");
    expect(migration).toContain("x-oraculo-backup-cron-secret");
    expect(migration).toContain("revoke all on function public.invoke_organization_backup_cron()");
  });
});
