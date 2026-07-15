// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  decodeBackupPayload,
  encodeBackupPayload,
} from "../../supabase/functions/_shared/backup-codec";

describe("backup codec", () => {
  it("round-trips a gzip payload", async () => {
    const payload = JSON.stringify({ schemaVersion: 1, name: "Oraculo" });
    const compressed = await encodeBackupPayload(payload);

    expect(compressed[0]).toBe(0x1f);
    expect(compressed[1]).toBe(0x8b);
    await expect(decodeBackupPayload(compressed)).resolves.toBe(payload);
  });

  it("accepts payloads transparently decoded by an S3-compatible fetch", async () => {
    const payload = JSON.stringify({ schemaVersion: 1, source: "external" });
    const decodedBytes = new TextEncoder().encode(payload);

    await expect(decodeBackupPayload(decodedBytes)).resolves.toBe(payload);
  });
});
