import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { findSecretFindings } from "./ci-checks.ts";

const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const findings = tracked.flatMap((path) => {
  const buffer = readFileSync(path);
  if (buffer.includes(0)) return [];
  return findSecretFindings(path, buffer.toString("utf8"));
});

if (findings.length) {
  console.error("Possiveis segredos ou arquivos sensiveis versionados:");
  for (const finding of findings) console.error(`- ${finding.path}: ${finding.rule}`);
  process.exit(1);
}

console.log(`Secret scan: ${tracked.length} arquivos rastreados, nenhum segredo de alta confianca encontrado.`);
