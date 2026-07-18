import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPlanContext } from "../../supabase/functions/_shared/plan-context.ts";
import { renderPlanForWhatsApp } from "../../supabase/functions/_shared/plan-render.ts";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;
const FUNCTIONS_URL = `${process.env.SUPABASE_STAGING_URL}/functions/v1/oracle-session`;
const admin = RUN ? serviceClient() : (null as ReturnType<typeof serviceClient>);

let org: DisposableOrg;
let ownerJwt = "";
let quarterlyObjectiveId = "";
let integrationActionId = "";

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

d("Q4X - fechamento trimestral com rolagem seletiva", () => {
  beforeAll(async () => {
    org = await createDisposableOrg("q4x-quarter-close");
    const login = await anonClient().auth.signInWithPassword({ email: org.owner.email, password: org.owner.password });
    if (login.error || !login.data.session) throw login.error ?? new Error("login Q4X falhou");
    ownerJwt = login.data.session.access_token;

    const strategic = await admin.from("objectives").insert({
      org_id: org.orgId,
      area_id: null,
      level: "strategic",
      type: "harvest",
      title: "Aumentar previsibilidade comercial com adoção consistente do processo",
      result: "Aumentar previsibilidade comercial",
      metric: "Previsibilidade",
      current: "60%",
      target: "85%",
      deadline: "2027-12-31",
      owner: "PERSON_FIXTURE_OWNER",
      evidence_plan: "Relatório executivo",
      status: "on_track",
      progress: 60,
      period: "2027",
    }).select("id").single();
    if (strategic.error || !strategic.data) throw strategic.error ?? new Error("objetivo anual Q4X ausente");
    const areaAnnual = await admin.from("objectives").insert({
      org_id: org.orgId,
      area_id: org.areas.comercialId,
      level: "area_annual",
      type: "harvest",
      title: "Aumentar previsibilidade comercial com adoção consistente do processo",
      result: "Aumentar previsibilidade comercial",
      metric: "Previsibilidade",
      target: "85%",
      deadline: "2027-12-31",
      owner: "PERSON_FIXTURE_MANAGER",
      status: "on_track",
      progress: 60,
      parent_id: strategic.data.id,
      period: "2027",
    }).select("id").single();
    if (areaAnnual.error || !areaAnnual.data) throw areaAnnual.error ?? new Error("objetivo anual da área Q4X ausente");
    const quarterly = await admin.from("objectives").insert({
      org_id: org.orgId,
      area_id: org.areas.comercialId,
      level: "quarterly",
      type: "harvest",
      title: "Elevar adoção do processo comercial",
      result: "Elevar adoção de 60% para 80%",
      metric: "Adoção do processo",
      current: "78%",
      target: "80%",
      deadline: "2027-06-30",
      owner: "PERSON_FIXTURE_MANAGER",
      evidence_plan: "Relatório de adoção",
      status: "at_risk",
      progress: 78,
      parent_id: areaAnnual.data.id,
      period: "T2 2027",
    }).select("id").single();
    if (quarterly.error || !quarterly.data) throw quarterly.error ?? new Error("objetivo trimestral Q4X ausente");
    quarterlyObjectiveId = String(quarterly.data.id);
    const actions = await admin.from("key_actions").insert([
      { org_id: org.orgId, objective_id: quarterlyObjectiveId, description: "Padronizar rotina comercial", completion_criterion: "Rotina aprovada", deadline: "2027-05-31", owner: "PERSON_FIXTURE_MANAGER", status: "done" },
      { org_id: org.orgId, objective_id: quarterlyObjectiveId, description: "Concluir integração externa", completion_criterion: "Integração validada", deadline: "2027-06-30", owner: "PERSON_FIXTURE_MANAGER", status: "late" },
    ]).select("id,description");
    if (actions.error || !actions.data) throw actions.error ?? new Error("ações Q4X ausentes");
    integrationActionId = String(actions.data.find((action) => action.description === "Concluir integração externa")?.id ?? "");
    if (!integrationActionId) throw new Error("ação de integração Q4X ausente");
  }, 60_000);

  afterAll(async () => {
    if (org) await destroyDisposableOrg(org);
  }, 60_000);

  it("inclui as ações trimestrais e seus ids no contexto seguro", async () => {
    const context = await buildPlanContext(admin, org.orgId, {
      areaId: org.areas.comercialId,
      focus: "quarterly",
      period: "T2 2027",
    });

    expect(context).toContain("AÇÕES-CHAVE:");
    expect(context).toContain("Concluir integração externa");
    expect(context).toContain(`id: ${integrationActionId}`);
  });

  it("rola somente a integração uma vez com novo escopo e prazo", async () => {
    const started = await call({
      action: "start",
      orgId: org.orgId,
      areaId: org.areas.comercialId,
      type: "quarter_close",
      period: "T2 2027",
      channel: "web",
    });
    const sessionId = String(started.session?.id ?? "");
    expect(sessionId).not.toBe("");

    const proposal = {
      type: "quarter_close",
      period: "T2 2027",
      nextPeriod: "T3 2027",
      summary: "Resultado parcial em 78% contra meta de 80%.",
      completionRate: 78,
      annualAlignment: {
        status: "linked",
        strategicObjectiveTitle: "Aumentar previsibilidade comercial com adoção consistente do processo",
      },
      reviews: [{
        objectiveId: quarterlyObjectiveId,
        title: "Elevar adoção do processo comercial",
        statusFinal: "at_risk",
        progressFinal: 78,
        current: "78%",
        target: "80%",
        metric: "Adoção do processo",
        owner: "PERSON_FIXTURE_MANAGER",
        evidence: "Relatório de adoção do T2 2027",
        learning: "Dependência externa foi subestimada",
        decision: "roll",
        reason: "dependência externa subestimada",
        newScope: "Integração principal",
        newDeadline: "2027-07-31",
      }],
      learnings: ["Dependência externa foi subestimada"],
      nextLearningFocus: ["Validar dependência no início do próximo trimestre"],
      pendencies: [{
        kind: "action",
        objectiveId: quarterlyObjectiveId,
        actionId: integrationActionId,
        actionTitle: "Concluir integração externa",
        decision: "roll",
        reason: "dependência externa subestimada",
        newScope: "Integração principal",
        newDeadline: "2027-07-31",
      }],
    };
    const seeded = await admin.from("planning_sessions").update({ pending_proposal: proposal })
      .eq("id", sessionId).eq("org_id", org.orgId);
    if (seeded.error) throw seeded.error;

    const confirmed = await call({ action: "confirm", sessionId, channel: "web" });
    expect(String(confirmed.reply)).toContain("Fechamento salvo");

    const [nextObjective, evidence, document] = await Promise.all([
      admin.from("objectives").select("id,parent_id,period").eq("org_id", org.orgId).eq("area_id", org.areas.comercialId).eq("level", "quarterly").eq("period", "T3 2027").single(),
      admin.from("evidences").select("text").eq("org_id", org.orgId).eq("objective_id", quarterlyObjectiveId).single(),
      admin.from("plan_documents").select("content").eq("session_id", sessionId).eq("type", "quarter_close").single(),
    ]);
    for (const result of [nextObjective, evidence, document]) if (result.error) throw result.error;
    const nextActions = await admin.from("key_actions").select("description,deadline,status")
      .eq("org_id", org.orgId).eq("objective_id", nextObjective.data!.id);
    if (nextActions.error) throw nextActions.error;

    expect(nextActions.data).toEqual([{
      description: "Integração principal (rolado de T2 2027)",
      deadline: "2027-07-31",
      status: "on_track",
    }]);
    expect(evidence.data?.text).toBe("Relatório de adoção do T2 2027");
    const content = document.data?.content as any;
    expect(content.referencia.objetivo_anual).toContain("Aumentar previsibilidade comercial");
    expect(content.objetivos[0]).toMatchObject({ atual: "78%", meta: "80%", responsavel: "PERSON_FIXTURE_MANAGER" });
    expect(content.fechamento.pendencias[0]).toContain("Integração principal");
    expect(content.fechamento.pendencias[0]).toContain("novo prazo: 2027-07-31");
    const whatsapp = renderPlanForWhatsApp(content);
    expect(whatsapp).toContain("Alinhamento anual: Aumentar previsibilidade comercial");
    expect(whatsapp).toContain("novo prazo: 2027-07-31");
  }, 60_000);
});
