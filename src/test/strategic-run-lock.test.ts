import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acquireStrategicPhaseLock } from "../../scripts/strategic-run-lock";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("strategic phase lock", () => {
  it("blocks a concurrent phase and releases it for the next run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "oraculo-strategic-lock-"));
    directories.push(directory);
    const release = await acquireStrategicPhaseLock(directory, "q5", "Q5B");

    await expect(acquireStrategicPhaseLock(directory, "q5", "Q5B"))
      .rejects.toThrow("Q5B ja esta ativa");

    await release();
    const releaseAgain = await acquireStrategicPhaseLock(directory, "q5", "Q5B");
    await releaseAgain();
  });
});
