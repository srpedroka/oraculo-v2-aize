import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";
import { configureDisposableAi, runtimeConfiguration } from "../../scripts/strategic-eval";

// This journey now calls the real planning model by design. Keep it opt-in so
// ordinary CI never spends API credits; the tracked strategic smoke is the gate.
const RUN = hasStagingEnv()
  && process.env.RUN_F2_LIVE_SITUATIONS === "true"
  && Boolean(process.env.ORACULO_EVAL_API_KEY);
const d = RUN ? describe : describe.skip;
const FUNCTIONS_URL = `${process.env.SUPABASE_STAGING_URL}/functions/v1/oracle-session`;
const admin = RUN ? serviceClient() : (null as ReturnType<typeof serviceClient>);

let org: DisposableOrg;
let ownerJwt = "";

const completeBlock = `Dados concretos adicionais confirmados pelo gestor sintetico para fechar Jul 2027:
- Objetivo mensal: elevar oportunidades com proxima acao de 40% para 55% ate 31/07/2027; fonte relatorio semanal; responsavel PERSON_FIXTURE_MANAGER; vinculo ao objetivo trimestral de qualidade do funil.
- Acao 1: publicar checklist ate 05/07, criterio checklist aprovado; responsavel PERSON_FIXTURE_MANAGER.
- Acao 2: treinar aprovadores ate 10/07, criterio todos os aprovadores presentes; responsavel PERSON_FIXTURE_MANAGER.
- Acao 3: auditar vinte casos ate 20/07, criterio relatorio publicado; responsavel PERSON_FIXTURE_MANAGER.
- Acao 4: corrigir duas causas principais ate 25/07, criterio correcoes validadas; responsavel PERSON_FIXTURE_MANAGER.
- Acao 5: revisar indicador ate 31/07, criterio fechamento registrado; responsavel PERSON_FIXTURE_MANAGER.
- Acompanhamento semanal. Confianca amarela. Bloqueio principal: adesao da equipe. As demais demandas ficam no backlog do mes.`;

async function call(body: Record<string, unknown>) {
  const response = await fetch(FUNCTIONS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${ownerJwt}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as Record<string, any>;
  expect(response.status, JSON.stringify(payload)).toBe(200);
  return payload;
}

d("Q4V — bloco mensal completo com capacidade", () => {
  beforeAll(async () => {
    org = await createDisposableOrg("q4v-monthly-ready");
    const login = await anonClient().auth.signInWithPassword({ email: org.owner.email, password: org.owner.password });
    if (login.error || !login.data.session) throw login.error ?? new Error("login Q4V falhou");
    ownerJwt = login.data.session.access_token;
    await configureDisposableAi({
      orgId: org.orgId,
      label: org.label,
      owner: org.owner,
      areaId: org.areas.comercialId,
    }, runtimeConfiguration());
    const { error } = await admin.from("objectives").insert({
      org_id: org.orgId,
      area_id: org.areas.comercialId,
      level: "quarterly",
      type: "harvest",
      title: "Elevar qualidade do funil comercial",
      result: "Melhorar previsibilidade do trimestre",
      metric: "Oportunidades com próxima ação",
      current: "40%",
      target: "85%",
      deadline: "2027-09-30",
      owner: "PERSON_FIXTURE_MANAGER",
      evidence_plan: "Relatório semanal",
      status: "on_track",
      progress: 0,
      period: "T3 2027",
    });
    if (error) throw error;
    const { error: historyError } = await admin.from("plan_documents").insert({
      org_id: org.orgId,
      area_id: org.areas.comercialId,
      type: "monthly",
      period: "Jun 2027",
      title: "Histórico de capacidade",
      content: { raw: "Mes anterior terminou com sete acoes abertas por excesso de compromisso." },
      version: 1,
      origin: "historical",
      created_by: org.owner.id,
    });
    if (historyError) throw historyError;
  }, 60_000);

  afterAll(async () => {
    if (org) await destroyDisposableOrg(org);
  }, 60_000);

  it("usa a IA para a fala, confirma uma vez e preserva escolhas canônicas no documento", async () => {
    const start = await call({
      action: "start",
      orgId: org.orgId,
      areaId: org.areas.comercialId,
      type: "monthly",
      period: "Jul 2027",
      channel: "web",
    });
    const sessionId = String(start.session?.id ?? "");
    expect(sessionId).not.toBe("");

    const capacity = await call({
      action: "message",
      sessionId,
      channel: "web",
      message: [
        "A equipe tem capacidade estimada para cinco acoes relevantes.",
        "Tres acoes contribuem diretamente para o objetivo trimestral; duas reduzem risco operacional.",
        "As demais podem ser adiadas sem comprometer a meta do trimestre.",
      ].join("\n"),
    });
    expect(capacity.pendingProposal).toBeFalsy();
    expect(String(capacity.reply)).not.toMatch(/state_patch|next_phase|proposal/i);
    expect(String(capacity.reply).match(/\?/g)).toHaveLength(1);
    expect(capacity.session?.state).toMatchObject({
      capacidade: { comprometidas: 5, demandas: 12 },
      criterio_priorizacao: { resultado_trimestral: 3, risco_operacional: 2 },
    });

    const response = await call({ action: "message", sessionId, message: completeBlock, channel: "web" });
    const proposal = response.pendingProposal as Record<string, any>;
    expect(proposal.type).toBe("save_monthly_plan");
    expect(proposal.objectives[0]).toMatchObject({
      result: "Elevar oportunidades com proxima acao de 40% para 55%",
      current: "40%",
      target: "55%",
    });
    expect(proposal.objectives[0].actions).toHaveLength(5);
    expect(proposal.backlog).toEqual(["As demais demandas ficam no backlog do mes"]);
    expect(proposal.confidence).toBe("amarela");
    expect(String(response.reply).match(/\?/g)).toHaveLength(1);

    const { data: usageRows, error: usageBeforeError } = await admin.from("ai_usage_logs")
      .select("total_cost_usd,metadata").eq("org_id", org.orgId).order("created_at", { ascending: true });
    if (usageBeforeError) throw usageBeforeError;
    expect(usageRows?.length).toBeGreaterThanOrEqual(2);
    const metadataRows = (usageRows ?? []).map((row) => row.metadata as Record<string, unknown>);
    const planningMetadata = metadataRows.filter((metadata) => metadata.aiFunction === "planning");
    const extractionMetadata = metadataRows.filter((metadata) => metadata.aiFunction === "background");
    expect(planningMetadata.every((metadata) => Array.isArray(metadata.adaptiveStyleObservationCodes))).toBe(true);
    expect(planningMetadata.every((metadata) => Number.isFinite(Number(metadata.adaptiveStyleObservationCount)))).toBe(true);
    expect(planningMetadata.every((metadata) => Number.isFinite(Number(metadata.adaptiveStyleObservationLatencyMs)))).toBe(true);
    expect(planningMetadata
      .filter((metadata) => Number(metadata.adaptiveAttempt) === 2)
      .every((metadata) => Array.isArray(metadata.adaptiveRepairReasons)
        && (metadata.adaptiveRepairReasons as unknown[]).length > 0)).toBe(true);
    if (process.env.ORACULO_EVAL_PROSE_SPLIT === "true") {
      expect(extractionMetadata.length).toBe(planningMetadata.length);
      expect(extractionMetadata.every((metadata) => Number(metadata.extractionAttempt) === 1)).toBe(true);
      expect(extractionMetadata.every((metadata) => Number(metadata.extractionRepairCount) === 0)).toBe(true);
    }
    expect(JSON.stringify(metadataRows)).not.toMatch(/(?:reply|prompt|message|context|phone|document)/i);
    console.info("F3_STYLE_OBSERVATION", JSON.stringify({
      calls: metadataRows.length,
      repairs: metadataRows.filter((metadata) => Number(metadata.adaptiveAttempt) === 2).length,
      observations: metadataRows.reduce((sum, metadata) => sum + Number(metadata.adaptiveStyleObservationCount ?? 0), 0),
      latencyMs: metadataRows.reduce((sum, metadata) => sum + Number(metadata.adaptiveStyleObservationLatencyMs ?? 0), 0),
      costUsd: (usageRows ?? []).reduce((sum, row) => sum + Number(row.total_cost_usd ?? 0), 0),
    }));

    await call({ action: "confirm", sessionId, channel: "web" });
    const { data: objective, error: objectiveError } = await admin.from("objectives")
      .select("id,result,parent_id").eq("org_id", org.orgId).eq("level", "monthly").eq("period", "Jul 2027").single();
    if (objectiveError || !objective) throw objectiveError ?? new Error("objetivo mensal Q4V ausente");
    const [{ count: actionCount, error: actionError }, { data: document, error: documentError }] = await Promise.all([
      admin.from("key_actions").select("id", { count: "exact", head: true }).eq("objective_id", objective.id),
      admin.from("plan_documents").select("content").eq("session_id", sessionId).eq("type", "monthly").single(),
    ]);
    if (actionError) throw actionError;
    if (documentError || !document) throw documentError ?? new Error("documento mensal Q4V ausente");
    expect(actionCount).toBe(5);
    expect(objective.result).toContain("40% para 55%");
    expect(objective.parent_id).not.toBeNull();
    expect((document.content as any).monthly).toMatchObject({
      confianca: "amarela",
      backlog: ["As demais demandas ficam no backlog do mes"],
      capacidade: { acoes_comprometidas: 5, maximo_acoes_comprometidas: 5 },
    });
  }, 150_000);
});
