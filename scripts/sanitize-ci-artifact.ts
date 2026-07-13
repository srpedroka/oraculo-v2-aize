import { readFileSync, writeFileSync } from "node:fs";
import { sanitizeCiOutput, secretValuesFromEnv } from "./ci-checks.ts";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("Uso: sanitize-ci-artifact.ts <entrada> <saida>");
  process.exit(2);
}

writeFileSync(output, sanitizeCiOutput(readFileSync(input, "utf8"), secretValuesFromEnv(process.env)), "utf8");
