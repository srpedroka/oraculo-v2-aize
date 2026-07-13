import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { sanitizeCiOutput, secretValuesFromEnv } from "./ci-checks.ts";

const separator = process.argv.indexOf("--");
const label = process.argv[2];
if (!label || separator < 0 || !process.argv[separator + 1]) {
  console.error("Uso: run-ci-command.ts <rotulo> -- <comando> [args...]");
  process.exit(2);
}

const command = process.argv[separator + 1];
const args = process.argv.slice(separator + 2);
const result = spawnSync(command, args, { encoding: "utf8", env: process.env });
const raw = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? `${result.error.message}\n` : ""}`;
const sanitized = sanitizeCiOutput(raw, secretValuesFromEnv(process.env));

mkdirSync("ci-artifacts", { recursive: true });
writeFileSync(`ci-artifacts/${label.replace(/[^a-z0-9_-]/gi, "-")}.log`, sanitized, "utf8");
process.stdout.write(sanitized);
process.exit(result.status ?? 1);
