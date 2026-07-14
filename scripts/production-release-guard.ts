import { readFileSync, realpathSync } from "node:fs";
import { basename, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const FUNCTION_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIGRATION_NAME = /^\d{14}_[a-z0-9_]+\.sql$/;

const DESTRUCTIVE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "DROP", pattern: /\bdrop\s+(?:table|schema|column|type|database|view|materialized\s+view|function|trigger|policy|index)\b/i },
  { label: "TRUNCATE", pattern: /\btruncate(?:\s+table)?\b/i },
  { label: "ALTER TABLE ... DROP", pattern: /\balter\s+table\b[\s\S]*?\bdrop\s+(?:column|constraint)\b/i },
  { label: "DELETE sem WHERE", pattern: /\bdelete\s+from\s+[\w."-]+\s*;/i },
];

function stripSqlComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n\r]*/g, " ");
}

export function validateFunctionNames(names: string[]): string[] {
  const normalized = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  const invalid = normalized.filter((name) => !FUNCTION_NAME.test(name));
  if (invalid.length > 0) {
    throw new Error(`Nomes de Edge Function invalidos: ${invalid.join(", ")}`);
  }
  return normalized;
}

export function destructiveMigrationFindings(files: string[]): string[] {
  const migrationsRoot = realpathSync(resolve("supabase/migrations"));
  const findings: string[] = [];

  for (const file of files) {
    const absolute = realpathSync(resolve(file));
    if (!absolute.startsWith(`${migrationsRoot}${sep}`) || !MIGRATION_NAME.test(basename(absolute))) {
      throw new Error(`Migration fora do caminho permitido: ${file}`);
    }

    const source = stripSqlComments(readFileSync(absolute, "utf8"));
    for (const check of DESTRUCTIVE_PATTERNS) {
      if (check.pattern.test(source)) findings.push(`${basename(file)}: ${check.label}`);
    }
  }

  return findings;
}

function fail(message: string): never {
  console.error(`RECUSADO: ${message}`);
  process.exit(1);
}

function runCli(): void {
  const [action, flag, ...args] = process.argv.slice(2);

  if (action === "functions") {
    const names = validateFunctionNames([flag, ...args].filter(Boolean).join(" ").split(/\s+/));
    if (names.length === 0) fail("informe ao menos uma Edge Function explicita.");
    console.log(names.join("\n"));
    return;
  }

  if (action === "migrations") {
    const allowDestructive = flag === "--allow-destructive";
    const files = allowDestructive ? args : [flag, ...args].filter(Boolean);
    const findings = destructiveMigrationFindings(files);
    if (findings.length > 0 && !allowDestructive) {
      fail(`migration destrutiva exige aprovacao explicita (${findings.join("; ")}).`);
    }
    console.log(findings.length > 0 ? `Aprovacao destrutiva registrada: ${findings.join("; ")}` : "Migrations sem operacao destrutiva detectada.");
    return;
  }

  fail("uso: functions <nomes...> | migrations [--allow-destructive] <arquivos...>");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
