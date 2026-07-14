import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { destructiveMigrationFindings, validateFunctionNames } from "../../scripts/production-release-guard";

const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
});

function migration(source: string): string {
  const root = mkdtempSync(join(tmpdir(), "oraculo-release-"));
  const directory = join(root, "supabase", "migrations");
  mkdirSync(directory, { recursive: true });
  const file = join(directory, "20260714000000_fixture.sql");
  writeFileSync(file, source);
  process.chdir(root);
  return file;
}

describe("production release guard", () => {
  it("aceita somente nomes explicitos e deduplicados de Edge Functions", () => {
    expect(validateFunctionNames(["oracle-chat", "oracle-chat", "whatsapp-worker"])).toEqual([
      "oracle-chat",
      "whatsapp-worker",
    ]);
    expect(() => validateFunctionNames(["oracle-chat; rm -rf"])).toThrow(/invalidos/);
  });

  it("aprova migration aditiva", () => {
    const file = migration("alter table public.areas add column if not exists note text;\n");
    expect(destructiveMigrationFindings([file])).toEqual([]);
  });

  it.each([
    ["drop table public.areas;", "DROP"],
    ["truncate table public.areas;", "TRUNCATE"],
    ["alter table public.areas drop column name;", "DROP"],
    ["delete from public.areas;", "DELETE sem WHERE"],
  ])("detecta operacao destrutiva: %s", (source, label) => {
    const file = migration(source);
    expect(destructiveMigrationFindings([file])).toEqual(expect.arrayContaining([expect.stringContaining(label)]));
  });

  it("ignora palavras destrutivas presentes apenas em comentarios", () => {
    const file = migration("-- drop table public.areas;\n/* truncate public.memberships; */\nselect 1;\n");
    expect(destructiveMigrationFindings([file])).toEqual([]);
  });

  it("recusa arquivo fora da pasta versionada de migrations", () => {
    const root = mkdtempSync(join(tmpdir(), "oraculo-release-outside-"));
    const file = join(root, "20260714000000_fixture.sql");
    writeFileSync(file, "select 1;");
    expect(() => destructiveMigrationFindings([file])).toThrow(/fora do caminho/);
  });
});
