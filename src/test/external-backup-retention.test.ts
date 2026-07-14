import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("supabase/functions/_shared/organization-backup.ts", "utf8");

describe("external backup retention", () => {
  it("never gives the application an external delete operation", () => {
    expect(source).not.toContain("DeleteObjectCommand");
    expect(source).not.toContain("deleteExternal(");
  });

  it("keeps lifecycle cleanup limited to internal storage", () => {
    const start = source.indexOf("export async function deleteOrganizationBackup");
    const end = source.indexOf("function localParts", start);
    const lifecycleSource = source.slice(start, end);
    expect(lifecycleSource).toContain("storage.from(STORAGE_BUCKET).remove");
    expect(lifecycleSource).not.toContain("externalClient(");
    expect(lifecycleSource).not.toContain("external_object_key");
  });
});
