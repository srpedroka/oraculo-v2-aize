import { spawnSync } from "node:child_process";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertStaging } from "../tests/helpers/staging.ts";

const PRODUCTION_REF = "bkswkfazkjilwfzwzthz";
const BASELINE_PATH = resolve(".agents-private/master-test-7a.json");
const FUNCTIONAL_REPORT_PATH = resolve(".agents-private/master-test-7b.json");
const REPORT_PATH = resolve(".agents-private/master-test-7c.json");

interface PreviousReport {
  runId: string;
  stagingProjectRef: string;
  completedAt?: string;
}

interface Scenario {
  id: string;
  description: string;
  config: string;
  files: string[];
}

interface ScenarioResult {
  id: string;
  description: string;
  status: "passed" | "failed";
  files: string[];
  completedAt: string;
}

interface FailureReport {
  version: 1;
  runId: string;
  startedAt: string;
  completedAt?: string;
  stagingProjectRef: string;
  productionTouched: false;
  realWhatsappTouched: false;
  scenarios: ScenarioResult[];
}

const scenarios: Scenario[] = [
  {
    id: "7C1",
    description: "evento repetido do WhatsApp e deduplicação concorrente",
    config: "vitest.integration.config.ts",
    files: ["tests/integration/whatsapp-inbound-queue.test.ts"],
  },
  {
    id: "7C2",
    description: "provedor de IA indisponível, timeout e sanitização",
    config: "vitest.config.ts",
    files: ["supabase/functions/_shared/model-probe.test.ts", "supabase/functions/_shared/structured-log.test.ts"],
  },
  {
    id: "7C3",
    description: "Evolution 500/timeout, retry, dead-letter e envio sanitizado",
    config: "vitest.integration.config.ts",
    files: ["tests/integration/whatsapp-outbox.test.ts", "tests/integration/whatsapp-worker.test.ts"],
  },
  {
    id: "7C3U",
    description: "classificação unitária das falhas transitórias da Evolution",
    config: "vitest.config.ts",
    files: ["supabase/functions/_shared/whatsapp-sender.test.ts"],
  },
  {
    id: "7C4",
    description: "rollback no último item e duas confirmações simultâneas",
    config: "vitest.integration.config.ts",
    files: ["tests/integration/proposal-atomicity.test.ts"],
  },
  {
    id: "7C5",
    description: "isolamento entre empresas e matriz owner/admin/coordenador",
    config: "vitest.security.config.ts",
    files: ["tests/security/risk-coverage.test.ts", "tests/security/rls.test.ts"],
  },
  {
    id: "7C6",
    description: "limites concorrentes, orçamento e alertas da IA",
    config: "vitest.integration.config.ts",
    files: ["tests/integration/ai-controls.test.ts"],
  },
  {
    id: "7C7",
    description: "exceção recuperável no frontend e telemetria sanitizada",
    config: "vitest.config.ts",
    files: ["src/components/AppErrorBoundary.test.tsx"],
  },
  {
    id: "7C7I",
    description: "registro operacional sanitizado de erro do frontend",
    config: "vitest.integration.config.ts",
    files: ["tests/integration/operational-health.test.ts"],
  },
  {
    id: "7C8",
    description: "cópia externa de backup indisponível",
    config: "vitest.integration.config.ts",
    files: ["tests/integration/disaster-recovery.test.ts"],
  },
  {
    id: "7C9",
    description: "política verify_jwt das Edge Functions",
    config: "vitest.integration.config.ts",
    files: ["tests/integration/function-jwt.test.ts"],
  },
];

function stagingProjectRef() {
  const stagingUrl = process.env.SUPABASE_STAGING_URL ?? "";
  if (!stagingUrl) throw new Error("SUPABASE_STAGING_URL ausente");
  const ref = new URL(stagingUrl).hostname.split(".")[0];
  if (!ref || ref === PRODUCTION_REF) throw new Error("RECUSADO: Teste Mestre nunca roda em produção");
  return ref;
}

async function readPrevious(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as PreviousReport;
}

async function writeReport(report: FailureReport) {
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await chmod(REPORT_PATH, 0o600);
}

function runScenario(scenario: Scenario) {
  const result = spawnSync(process.execPath, [
    resolve("node_modules/vitest/vitest.mjs"),
    "--config",
    scenario.config,
    "run",
    ...scenario.files,
    "--passWithNoTests=false",
  ], { stdio: "inherit", env: process.env });

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${scenario.id} falhou com status ${result.status ?? "desconhecido"}`);
}

async function main() {
  assertStaging();
  const ref = stagingProjectRef();
  const baseline = await readPrevious(BASELINE_PATH);
  const functional = await readPrevious(FUNCTIONAL_REPORT_PATH);

  if (baseline.stagingProjectRef !== ref || functional.stagingProjectRef !== ref) {
    throw new Error("baseline ou relatório funcional pertence a outro staging");
  }
  if (baseline.runId !== functional.runId || !functional.completedAt) {
    throw new Error("a Fatia 7B precisa estar concluída no mesmo ciclo MASTER");
  }

  const existing = await readFile(REPORT_PATH, "utf8")
    .then((value) => JSON.parse(value) as FailureReport)
    .catch(() => null);
  if (existing?.completedAt) throw new Error(`7C já foi concluída em ${existing.completedAt}; preserve a evidência`);

  const report: FailureReport = existing ?? {
    version: 1,
    runId: baseline.runId,
    startedAt: new Date().toISOString(),
    stagingProjectRef: ref,
    productionTouched: false,
    realWhatsappTouched: false,
    scenarios: [],
  };
  if (report.runId !== baseline.runId) throw new Error("relatório 7C pertence a outro ciclo MASTER");
  await writeReport(report);

  const completed = new Set(report.scenarios.filter((item) => item.status === "passed").map((item) => item.id));
  for (const scenario of scenarios) {
    if (completed.has(scenario.id)) continue;
    console.log(`\n[${scenario.id}] ${scenario.description}`);
    try {
      runScenario(scenario);
      report.scenarios.push({
        id: scenario.id,
        description: scenario.description,
        status: "passed",
        files: scenario.files,
        completedAt: new Date().toISOString(),
      });
      await writeReport(report);
    } catch (error) {
      report.scenarios.push({
        id: scenario.id,
        description: scenario.description,
        status: "failed",
        files: scenario.files,
        completedAt: new Date().toISOString(),
      });
      await writeReport(report);
      throw error;
    }
  }

  report.completedAt = new Date().toISOString();
  await writeReport(report);
  console.log(JSON.stringify({
    ok: true,
    action: "failure-scenarios",
    runId: report.runId,
    scenariosPassed: report.scenarios.filter((item) => item.status === "passed").length,
    reportFile: REPORT_PATH,
    productionTouched: report.productionTouched,
    realWhatsappTouched: report.realWhatsappTouched,
  }, null, 2));
}

await main();
