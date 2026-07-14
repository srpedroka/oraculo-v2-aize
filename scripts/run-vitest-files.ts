import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

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

for (const file of files) {
  const result = spawnSync(process.execPath, [
    resolve("node_modules/vitest/vitest.mjs"),
    "--config",
    suite.config,
    "run",
    file,
    "--passWithNoTests=false",
  ], { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`${suiteName}: ${files.length} arquivo(s) executado(s) com coleta obrigatória.`);
