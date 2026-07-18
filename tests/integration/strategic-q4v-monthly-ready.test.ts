import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = hasStagingEnv();
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

  it("gera uma proposta sem IA, confirma uma vez e preserva escolhas no documento", async () => {
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
    expect(String(capacity.reply)).toContain("sete ações abertas por excesso de compromisso");
    expect(String(capacity.reply)).toContain("três ações ligadas ao objetivo trimestral e duas para reduzir risco");
    expect(String(capacity.reply).match(/\?/g)).toHaveLength(1);

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

    const { count: usageBefore, error: usageBeforeError } = await admin.from("ai_usage_logs")
      .select("id", { count: "exact", head: true }).eq("org_id", org.orgId);
    if (usageBeforeError) throw usageBeforeError;
    expect(usageBefore).toBe(0);

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
  }, 60_000);
});
