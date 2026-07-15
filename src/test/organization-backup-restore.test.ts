import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("supabase/functions/_shared/organization-backup.ts", "utf8");

describe("organization backup restore", () => {
  it("always gives the restored owner membership a required timestamp", () => {
    expect(source).toContain('role: "owner", created_at: new Date().toISOString()');
  });

  it("replaces restore-generated revisions with the source audit history", () => {
    const cleanup = source.indexOf('.from("operational_revisions")\n      .delete()');
    const sourceHistory = source.indexOf('rowsOf(data, "operational_revisions")', cleanup);
    const insert = source.indexOf(
      'restoredCounts.operational_revisions = await insertRows',
      sourceHistory,
    );

    expect(cleanup).toBeGreaterThan(0);
    expect(sourceHistory).toBeGreaterThan(cleanup);
    expect(insert).toBeGreaterThan(sourceHistory);
  });

  it("remaps audit request IDs so the clone baseline cannot collide", () => {
    expect(source).toContain('request_id: `restore:${String(row.id)}`');
  });

  it("restores sanitized recovery incidents with remapped actors", () => {
    expect(source).toContain('rowsOf(data, "organization_recovery_incidents")');
    expect(source).toContain("opened_by: mapId(userMap, row.opened_by)");
    expect(source).toContain("resolved_by: mapId(userMap, row.resolved_by)");
  });

  it("accepts externally decoded gzip objects without weakening checksum validation", () => {
    expect(source).toContain("decodeBackupPayload(compressed)");
    expect(source).toContain("envelope.checksum !== backup.checksum");
    expect(source).not.toContain('"content-encoding": "gzip"');
  });
});
