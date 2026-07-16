import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type ReferenceCaseBlock,
  type ReferenceCaseManifest,
  validateReferenceCaseCatalog,
} from "./strategic-reference-cases.ts";

const root = process.cwd();
const catalogRoot = resolve(root, "tests/evals/strategic-quality/cases");
const manifest = JSON.parse(readFileSync(resolve(catalogRoot, "q2-catalog.json"), "utf8")) as ReferenceCaseManifest;
const blocks = manifest.blocks.map((declaration) => (
  JSON.parse(readFileSync(resolve(root, declaration.file), "utf8")) as ReferenceCaseBlock
));
const rubric = JSON.parse(readFileSync(resolve(root, "tests/evals/strategic-quality/rubric.json"), "utf8"));
const coverage = JSON.parse(readFileSync(resolve(root, "tests/evals/strategic-quality/deliverable-coverage.json"), "utf8"));
const result = validateReferenceCaseCatalog({ manifest, blocks, rubric, coverage });

console.log(
  `Catalogo ${manifest.catalogVersion}: ${result.caseCount} casos, `
  + Object.entries(result.phaseCounts).map(([phase, count]) => `${phase}=${count}`).join(", ")
  + `, ${result.coveredDeliverables.length} entregas e ${result.coveredCriticalFailures.length} falhas criticas cobertas.`,
);
console.log(`Gate: ${manifest.gateStatus}; custo desta fase: US$ ${manifest.executionPolicy.expectedCostUsd.toFixed(2)}.`);
