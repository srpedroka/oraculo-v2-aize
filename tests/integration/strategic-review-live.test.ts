import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Provider } from "../../supabase/functions/_shared/model.ts";
import { resolveKnownPricing } from "../../supabase/functions/_shared/pricing.ts";
import { assertBudgetAllowsNextCall } from "../../scripts/strategic-eval-lib.ts";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = process.env.RUN_STRATEGIC_REVIEW_LIVE === "true"
  && hasStagingEnv()
  && Boolean(process.env.ORACULO_EVAL_API_KEY);
const d = RUN ? describe : describe.skip;
const FUNCTIONS_URL = `${process.env.SUPABASE_STAGING_URL}/functions/v1/oracle-session`;
const PRIVATE_DIR = resolve(".agents-private");
const LEDGER_PATH = resolve(PRIVATE_DIR, "strategic-eval-ledger.json");
const RUBRIC_PATH = resolve("tests/evals/strategic-quality/rubric.json");

let org: DisposableOrg | null = null;
let ownerJwt = "";
let revenueObjectiveId = "";
let marginObjectiveId = "";
let startedAt = "";
let proposalSnapshot: Record<string, unknown> | null = null;
let replySnapshot = "";
let confirmationCalls = 0;
let liveStatus: "approved" | "blocked" = "blocked";
let ledgerBefore: any = null;
let costPolicy: any = null;

const providerValue = String(process.env.ORACULO_EVAL_PROVIDER ?? "xai");
if (!(providerValue === "openai" || providerValue === "xai")) throw new Error("teste de revisão aceita somente OpenAI ou xAI");
const provider = providerValue as Provider;
const model = String(process.env.ORACULO_EVAL_PLANNING_MODEL ?? "grok-4.3");
const apiKey = String(process.env.ORACULO_EVAL_API_KEY ?? "");
const admin = RUN ? serviceClient() : (null as any);

async function readJson(path: string) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writePrivateJson(path: string, value: unknown) {
  await mkdir(PRIVATE_DIR, { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

async function callOracle(body: Record<string, unknown>) {
  const response = await fetch(FUNCTIONS_URL, {
    method: "POST",
    headers: {
      apikey: String(process.env.SUPABASE_STAGING_ANON_KEY),
      Authorization: `Bearer ${ownerJwt}`,
      "Content-Type": "application/json",
      "x-request-id": `strategic-review-live-${Date.now()}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as Record<string, any>;
  if (!response.ok) throw new Error(`oracle-session falhou (${response.status}): ${String(payload.error ?? "erro desconhecido")}`);
  return payload;
}

d("revisão estratégica adaptativa em staging", () => {
  beforeAll(async () => {
    ledgerBefore = await readJson(LEDGER_PATH);
    costPolicy = (await readJson(RUBRIC_PATH) as any).costPolicy;
    assertBudgetAllowsNextCall({
      cumulativePlanCostUsd: Number(ledgerBefore.cumulativePlanCostUsd ?? 0),
      currentCaseCostUsd: 0,
      reserveUsd: 0.15,
      policy: costPolicy,
    });
    org = await createDisposableOrg("strategic-review-live");
    const pricing = resolveKnownPricing(provider, model);
    if (!pricing) throw new Error("modelo do teste sem pricing versionado");
    const keyPreview = `****${apiKey.slice(-4)}`;
    const now = new Date().toISOString();
    const configuration = await Promise.all([
      admin.from("ai_model_keys").upsert({ org_id: org.orgId, provider, api_key: apiKey, updated_at: now }, { onConflict: "org_id,provider" }),
      admin.from("ai_provider_key_status").upsert({
        org_id: org.orgId,
        provider,
        has_key: true,
        key_preview: keyPreview,
        last_status: "untested",
        last_status_detail: "Chave descartável do teste de revisão estratégica.",
        updated_at: now,
      }, { onConflict: "org_id,provider" }),
      admin.from("ai_settings").upsert({
        org_id: org.orgId,
        provider,
        model,
        has_key: true,
        key_preview: keyPreview,
        input_token_price_usd_per_million: pricing.inputTokenPriceUsdPerMillion,
        output_token_price_usd_per_million: pricing.outputTokenPriceUsdPerMillion,
        pricing_source: pricing.source,
        updated_at: now,
      }, { onConflict: "org_id" }),
      admin.from("ai_function_settings").upsert({ org_id: org.orgId, function: "planning", provider, model, updated_at: now }, { onConflict: "org_id,function" }),
    ]);
    const configurationError = configuration.find((result) => result.error)?.error;
    if (configurationError) throw configurationError;

    const plan = await admin.from("strategic_plans").insert({
      org_id: org.orgId,
      year: 2026,
      profile: { sector: "fixture" },
      drivers: { purpose: "Crescer com disciplina", vision: "Operação previsível", values: ["Clareza"] },
      swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
      themes: ["Previsibilidade"],
      rituals: ["Revisão mensal"],
      executive_summary: "Plano sintético para revisão adaptativa.",
    });
    if (plan.error) throw plan.error;

    const objectives = await admin.from("objectives").insert([
      {
        org_id: org.orgId,
        area_id: null,
        level: "strategic",
        type: "harvest",
        title: "Aumentar a previsibilidade da receita",
        result: "Receita mais previsível",
        metric: "Receita coberta por previsão confiável",
        current: "55%",
        target: "80%",
        deadline: "2026-12-31",
        owner: "Owner sintético",
        status: "on_track",
        progress: 55,
        period: "2026",
      },
      {
        org_id: org.orgId,
        area_id: null,
        level: "strategic",
        type: "harvest",
        title: "Elevar a margem operacional",
        result: "Margem sustentável",
        metric: "Margem operacional",
        current: "8%",
        target: "12%",
        deadline: "2026-12-31",
        owner: "Owner sintético",
        status: "on_track",
        progress: 40,
        period: "2026",
      },
    ]).select("id,title");
    if (objectives.error) throw objectives.error;
    revenueObjectiveId = String(objectives.data?.find((item: any) => item.title === "Aumentar a previsibilidade da receita")?.id ?? "");
    marginObjectiveId = String(objectives.data?.find((item: any) => item.title === "Elevar a margem operacional")?.id ?? "");
    if (!revenueObjectiveId || !marginObjectiveId) throw new Error("objetivos sintéticos não foram criados");

    const login = await anonClient().auth.signInWithPassword({ email: org.owner.email, password: org.owner.password });
    if (login.error || !login.data.session) throw login.error ?? new Error("login do owner sintético falhou");
    ownerJwt = login.data.session.access_token;
    startedAt = new Date().toISOString();
  }, 90_000);

  afterAll(async () => {
    let generationCostUsd = 0;
    let cleanupSucceeded = false;
    let finalError: Error | null = null;
    const orgId = org?.orgId ?? null;
    if (org && startedAt) {
      const usage = await admin.from("ai_usage_logs").select("total_cost_usd").eq("org_id", org.orgId).gte("created_at", startedAt);
      if (usage.error) finalError = usage.error;
      else generationCostUsd = (usage.data ?? []).reduce((sum: number, item: any) => sum + Number(item.total_cost_usd ?? 0), 0);
    }
    if (org) {
      try {
        await destroyDisposableOrg(org);
        cleanupSucceeded = true;
      } catch (error) {
        finalError = finalError ?? (error instanceof Error ? error : new Error(String(error)));
      }
    }
    if (orgId && ledgerBefore) {
      const completedAt = new Date().toISOString();
      const runId = `strategic-review-${completedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`;
      const cumulativeBeforeUsd = Number(ledgerBefore.cumulativePlanCostUsd ?? 0);
      const cumulativeAfterUsd = cumulativeBeforeUsd + generationCostUsd;
      const status = liveStatus === "approved" && cleanupSucceeded && !finalError ? "approved" : "blocked";
      const reportPath = resolve(PRIVATE_DIR, `${runId}.json`);
      await writePrivateJson(reportPath, {
        schemaVersion: 1,
        caseId: "Q1-REVIEW-ALIGNMENT",
        environment: "staging",
        provider,
        model,
        proposal: proposalSnapshot,
        reply: replySnapshot,
        deterministicChecks: {
          completeBatchProducedProposal: Boolean(proposalSnapshot),
          confirmationCalls,
          adjustments: Array.isArray((proposalSnapshot as any)?.adjustments) ? (proposalSnapshot as any).adjustments.length : 0,
          cleanupSucceeded,
        },
        cost: { generationCostUsd, judgeCostUsd: 0, totalCaseCostUsd: generationCostUsd, cumulativeBeforeUsd, cumulativeAfterUsd },
        status,
        completedAt,
      });
      await writePrivateJson(LEDGER_PATH, {
        ...ledgerBefore,
        cumulativePlanCostUsd: cumulativeAfterUsd,
        runs: [...(ledgerBefore.runs ?? []), { runId, caseId: "Q1-REVIEW-ALIGNMENT", totalCostUsd: generationCostUsd, completedAt, status }],
      });
      console.log(`STRATEGIC_REVIEW_LIVE_REPORT path=${reportPath} generationCostUsd=${generationCostUsd.toFixed(6)} cumulative=${cumulativeBeforeUsd.toFixed(6)}->${cumulativeAfterUsd.toFixed(6)} cleanup=${cleanupSucceeded ? "OK" : "FALHOU"}`);
    }
    org = null;
    if (finalError) throw finalError;
  }, 90_000);

  it("absorve dois ajustes completos e grava após uma única confirmação", async () => {
    if (!org) throw new Error("empresa descartável ausente");
    const start = await callOracle({
      action: "start",
      orgId: org.orgId,
      type: "strategic_review",
      period: "2026",
      channel: "web",
    });
    const sessionId = String(start.session?.id ?? "");
    expect(sessionId).not.toBe("");

    const response = await callOracle({
      action: "message",
      sessionId,
      channel: "web",
      message: [
        "O fechamento de junho trouxe dados novos e precisamos revisar dois pontos do plano 2026.",
        "No objetivo Aumentar a previsibilidade da receita, altere o valor atual de 55% para 62%, porque o CRM consolidado de junho confirmou essa evolução.",
        "No objetivo Elevar a margem operacional, altere a meta de 12% para 11%, porque o novo contrato anual de insumos elevou o custo estrutural.",
        "Os demais objetivos permanecem iguais. Apresente tudo junto para uma única confirmação final.",
      ].join(" "),
    });

    expect(response.pendingProposal?.type).toBe("apply_strategic_review");
    expect(response.pendingProposal?.adjustments).toHaveLength(2);
    expect(String(response.reply ?? "")).toMatch(/confirm|gravar/i);
    expect(String(response.reply ?? "")).toMatch(/valor atual/i);
    expect(String(response.reply ?? "")).toMatch(/meta/i);
    expect(String(response.reply ?? "")).not.toMatch(/\b(current|target|metric|deadline)\b/i);
    expect((String(response.reply ?? "").match(/\?/g) ?? []).length).toBeLessThanOrEqual(1);

    const adjustments = response.pendingProposal.adjustments as Array<Record<string, unknown>>;
    expect(adjustments).toEqual(expect.arrayContaining([
      expect.objectContaining({ objectiveId: revenueObjectiveId, field: "current", from: "55%", to: "62%" }),
      expect.objectContaining({ objectiveId: marginObjectiveId, field: "target", from: "12%", to: "11%" }),
    ]));
    expect(adjustments.every((item) => String(item.because ?? "").trim().length > 0)).toBe(true);
    proposalSnapshot = response.pendingProposal as Record<string, unknown>;
    replySnapshot = String(response.reply ?? "");

    const beforeConfirm = await admin.from("objectives").select("id,current,target").in("id", [revenueObjectiveId, marginObjectiveId]);
    if (beforeConfirm.error) throw beforeConfirm.error;
    expect(beforeConfirm.data?.find((item: any) => item.id === revenueObjectiveId)?.current).toBe("55%");
    expect(beforeConfirm.data?.find((item: any) => item.id === marginObjectiveId)?.target).toBe("12%");

    await callOracle({ action: "confirm", sessionId, channel: "web" });
    confirmationCalls += 1;

    const [afterConfirm, documents, session] = await Promise.all([
      admin.from("objectives").select("id,current,target").in("id", [revenueObjectiveId, marginObjectiveId]),
      admin.from("plan_documents").select("id,type,content").eq("org_id", org.orgId).eq("type", "strategic_review"),
      admin.from("planning_sessions").select("status,pending_proposal").eq("id", sessionId).single(),
    ]);
    const error = [afterConfirm, documents, session].find((result) => result.error)?.error;
    if (error) throw error;

    expect(afterConfirm.data?.find((item: any) => item.id === revenueObjectiveId)?.current).toBe("62%");
    expect(afterConfirm.data?.find((item: any) => item.id === marginObjectiveId)?.target).toBe("11%");
    expect(documents.data).toHaveLength(1);
    expect((documents.data?.[0]?.content as any)?.ajustes).toHaveLength(2);
    expect(session.data).toMatchObject({ status: "completed", pending_proposal: null });
    liveStatus = "approved";
  }, 180_000);
});
