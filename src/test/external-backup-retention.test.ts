import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeS3Endpoint } from "../../supabase/functions/_shared/s3-endpoint";

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

  it("accepts the bucket-scoped URL copied from Cloudflare without duplicating the bucket", () => {
    expect(
      normalizeS3Endpoint(
        "https://account.r2.cloudflarestorage.com/oraculo-production-backups",
        "oraculo-production-backups",
      ),
    ).toBe("https://account.r2.cloudflarestorage.com");
    expect(
      normalizeS3Endpoint("https://account.r2.cloudflarestorage.com/", "oraculo-production-backups"),
    ).toBe("https://account.r2.cloudflarestorage.com");
  });

  it("bounds external calls so R2 cannot exhaust the backup worker", () => {
    expect(source).toContain("maxAttempts: 2");
    expect(source).toContain("EXTERNAL_REQUEST_TIMEOUT_MS = 60_000");
    expect(source.match(/AbortSignal\.timeout\(EXTERNAL_REQUEST_TIMEOUT_MS\)/g)).toHaveLength(2);
  });
});
