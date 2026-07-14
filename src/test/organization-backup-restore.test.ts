import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("supabase/functions/_shared/organization-backup.ts", "utf8");

describe("organization backup restore", () => {
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
});
