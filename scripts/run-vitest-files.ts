import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { isTransientLocalEdgeRuntimeFailure } from "./ci-transient-runtime.ts";

const suites = {
  integration: { directory: "tests/integration", config: "vitest.integration.config.ts" },
  security: { directory: "tests/security", config: "vitest.security.config.ts" },
} as const;

const suiteName = process.argv[2] as keyof typeof suites;
const suite = suites[suiteName];
if (!suite) throw new Error("Use integration ou security");

const files = readdirSync(resolve(suite.directory))
  .filter((file) => file.endsWith(".test.ts"))
  .sort()
  .map((file) => `${suite.directory}/${file}`);

if (!files.length) throw new Error(`Nenhum teste encontrado em ${suite.directory}`);

function runFile(file: string) {
  const result = spawnSync(process.execPath, [
    resolve("node_modules/vitest/vitest.mjs"),
    "--config",
    suite.config,
    "run",
    file,
    "--passWithNoTests=false",
  ], { encoding: "utf8", env: process.env });
  if (result.error) throw result.error;

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  return { result, output };
}

for (const file of files) {
  let attempt = runFile(file);
  if (
    attempt.result.status !== 0
    && suiteName === "integration"
    && isTransientLocalEdgeRuntimeFailure(attempt.output)
  ) {
    console.warn(`Runtime local fechou o socket em ${file}; repetindo este arquivo uma unica vez.`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2_000);
    attempt = runFile(file);
  }
  if (attempt.result.status !== 0) process.exit(attempt.result.status ?? 1);
}

console.log(`${suiteName}: ${files.length} arquivo(s) executado(s) com coleta obrigatória.`);
