import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";

type PhaseLock = {
  pid: number;
  startedAt: string;
  cohort: string;
  phase: string;
};

function processIsActive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    return error?.code !== "ESRCH";
  }
}

export async function acquireStrategicPhaseLock(
  privateDir: string,
  cohort: string,
  phase: string,
) {
  await mkdir(privateDir, { recursive: true });
  const lockPath = resolve(privateDir, `strategic-${cohort}-${phase.toLowerCase()}.lock`);

  const acquire = async (): Promise<() => Promise<void>> => {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      const lock: PhaseLock = { pid: process.pid, startedAt: new Date().toISOString(), cohort, phase };
      await handle.writeFile(`${JSON.stringify(lock)}\n`, "utf8");
      await handle.close();
      return async () => {
        try {
          await unlink(lockPath);
        } catch (error: any) {
          if (error?.code !== "ENOENT") throw error;
        }
      };
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error;
      let existing: Partial<PhaseLock> = {};
      try {
        existing = JSON.parse(await readFile(lockPath, "utf8")) as Partial<PhaseLock>;
      } catch {
        throw new Error(`lock da ${phase} existe, mas nao pode ser validado: ${lockPath}`);
      }
      if (processIsActive(Number(existing.pid))) {
        throw new Error(`${phase} ja esta ativa no processo ${existing.pid}; acompanhe a execucao existente em vez de repetir`);
      }
      await unlink(lockPath);
      return await acquire();
    }
  };

  return await acquire();
}
