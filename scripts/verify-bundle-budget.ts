import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

interface ManifestChunk {
  file: string;
  imports?: string[];
  isEntry?: boolean;
}

type Manifest = Record<string, ManifestChunk>;

const INITIAL_JS_GZIP_BUDGET = 200 * 1024;
const FORBIDDEN_INITIAL_MODULES = ["pdfjs-dist", "mammoth", "jszip", "xlsx"];
const distDir = join(process.cwd(), "dist");
const manifest = JSON.parse(readFileSync(join(distDir, ".vite", "manifest.json"), "utf8")) as Manifest;
const entryKey = Object.keys(manifest).find((key) => manifest[key]?.isEntry);

if (!entryKey) throw new Error("Manifesto do Vite sem entrypoint.");

const initialKeys = new Set<string>();

function collectStaticImports(key: string) {
  if (initialKeys.has(key)) return;
  const chunk = manifest[key];
  if (!chunk) throw new Error(`Chunk ausente no manifesto: ${key}`);
  initialKeys.add(key);
  for (const importedKey of chunk.imports ?? []) collectStaticImports(importedKey);
}

collectStaticImports(entryKey);

const forbidden = [...initialKeys].filter((key) => FORBIDDEN_INITIAL_MODULES.some((moduleName) => key.includes(moduleName)));
if (forbidden.length) {
  throw new Error(`Parser pesado entrou no carregamento inicial: ${forbidden.join(", ")}`);
}

const initialFiles = [...initialKeys]
  .map((key) => manifest[key]?.file)
  .filter((file): file is string => Boolean(file?.endsWith(".js")));
const initialGzipBytes = initialFiles.reduce((total, file) => total + gzipSync(readFileSync(join(distDir, file))).byteLength, 0);
const initialGzipKb = initialGzipBytes / 1024;
const budgetKb = INITIAL_JS_GZIP_BUDGET / 1024;

console.log(`Bundle inicial: ${initialGzipKb.toFixed(1)} KB gzip em ${initialFiles.length} arquivo(s); orçamento: ${budgetKb.toFixed(0)} KB.`);

if (initialGzipBytes > INITIAL_JS_GZIP_BUDGET) {
  throw new Error(`Bundle inicial excedeu o orçamento em ${(initialGzipKb - budgetKb).toFixed(1)} KB gzip.`);
}
