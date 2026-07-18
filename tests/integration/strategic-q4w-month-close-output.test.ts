import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderPlanForWhatsApp } from "../../supabase/functions/_shared/plan-render.ts";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;
const FUNCTIONS_URL = `${process.env.SUPABASE_STAGING_URL}/functions/v1/oracle-session`;
const admin = RUN ? serviceClient() : (null as ReturnType<typeof serviceClient>);

let org: DisposableOrg;
let ownerJwt = "";
let objectiveId = "";
let actionIds: string[] = [];

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

d("Q4W - fechamento mensal parcial e saída canônica", () => {
  beforeAll(async () => {
    org = await createDisposableOrg("q4w-month-close");
    const login = await anonClient().auth.signInWithPassword({ email: org.owner.email, password: org.owner.password });
    if (login.error || !login.data.session) throw login.error ?? new Error("login Q4W falhou");
    ownerJwt = login.data.session.access_token;

    const objectiveInsert = await admin.from("objectives").insert({
      org_id: org.orgId,
      area_id: org.areas.comercialId,
      level: "monthly",
      type: "harvest",
      title: "Elevar oportunidades com próxima ação no mês",
      result: "Elevar oportunidades com próxima ação de 40% para 60%",
      metric: "Oportunidades com próxima ação",
      current: "40%",
      target: "60%",
      deadline: "2027-06-30",
      owner: "PERSON_FIXTURE_MANAGER",
      evidence_plan: "Relatório semanal",
      status: "on_track",
      progress: 40,
      period: "Jun 2027",
    }).select("id").single();
    if (objectiveInsert.error || !objectiveInsert.data) throw objectiveInsert.error ?? new Error("objetivo Q4W ausente");
    objectiveId = String(objectiveInsert.data.id);

    const actionsInsert = await admin.from("key_actions").insert([
      { org_id: org.orgId, objective_id: objectiveId, description: "Revisar funil", completion_criterion: "Funil revisado", deadline: "2027-06-10", owner: "PERSON_FIXTURE_MANAGER", status: "on_track" },
      { org_id: org.orgId, objective_id: objectiveId, description: "Treinar equipe", completion_criterion: "Equipe treinada", deadline: "2027-06-20", owner: "PERSON_FIXTURE_MANAGER", status: "on_track" },
      { org_id: org.orgId, objective_id: objectiveId, description: "Concluir integração externa", completion_criterion: "Integração validada", deadline: "2027-06-30", owner: "PERSON_FIXTURE_MANAGER", status: "on_track" },
    ]).select("id,description");
    if (actionsInsert.error || !actionsInsert.data) throw actionsInsert.error ?? new Error("ações Q4W ausentes");
    const actionIdByDescription = new Map(actionsInsert.data.map((action) => [String(action.description), String(action.id)]));
    actionIds = ["Revisar funil", "Treinar equipe", "Concluir integração externa"]
      .map((description) => actionIdByDescription.get(description) ?? "");
    if (actionIds.some((id) => !id)) throw new Error("ids das ações Q4W incompletos");
  }, 60_000);

  afterAll(async () => {
    if (org) await destroyDisposableOrg(org);
  }, 60_000);

  it("confirma uma vez e preserva meta, atingido, aprendizado, pendência e pulso", async () => {
    const started = await call({
      action: "start",
      orgId: org.orgId,
      areaId: org.areas.comercialId,
      type: "month_close",
      period: "Jun 2027",
      channel: "web",
    });
    const sessionId = String(started.session?.id ?? "");
    expect(sessionId).not.toBe("");

    const proposal = {
      type: "month_close",
      period: "Jun 2027",
      nextPeriod: "Jul 2027",
      summary: "Resultado parcial: 50% contra meta de 60%.",
      completionRate: 50,
      reviews: [{
        objectiveId,
        title: "Elevar oportunidades com próxima ação no mês",
        statusFinal: "at_risk",
        progressFinal: 50,
        current: "50%",
        target: "60%",
        result: "Atingido 50% contra meta 60%",
        evidence: "Relatório semanal de Jun 2027",
        learning: "Envolver o fornecedor no início do próximo ciclo",
        actions: [
          { id: actionIds[0], status: "done" },
          { id: actionIds[1], status: "done" },
          { id: actionIds[2], status: "late" },
        ],
      }],
      learnings: ["Envolver o fornecedor no início do próximo ciclo"],
      pendencies: [{
        kind: "action",
        objectiveId,
        actionId: actionIds[2],
        decision: "renegotiate",
        reason: "dependência externa do fornecedor",
        newDeadline: "2027-07-20",
        newScope: "Concluir integração externa",
      }],
      managementPulse: {
        confidence: "yellow",
        confidenceReason: "dependência externa",
        blocker: "dependência externa do fornecedor",
        decisionNeeded: "",
        nextCommitment: "Validar o novo cronograma até 2027-07-05",
      },
    };
    const seeded = await admin.from("planning_sessions").update({ pending_proposal: proposal })
      .eq("id", sessionId).eq("org_id", org.orgId);
    if (seeded.error) throw seeded.error;

    const confirmed = await call({ action: "confirm", sessionId, channel: "web" });
    expect(String(confirmed.reply)).toContain("Fechamento salvo");

    const [objectiveResult, actionsResult, evidenceResult, checkInResult, documentResult] = await Promise.all([
      admin.from("objectives").select("current,target,status,progress").eq("id", objectiveId).single(),
      admin.from("key_actions").select("id,status,deadline").in("id", actionIds),
      admin.from("evidences").select("text").eq("org_id", org.orgId).eq("objective_id", objectiveId).single(),
      admin.from("check_ins").select("details").eq("org_id", org.orgId).eq("area_id", org.areas.comercialId).eq("period", "Jun 2027").single(),
      admin.from("plan_documents").select("content").eq("session_id", sessionId).eq("type", "month_close").single(),
    ]);
    for (const result of [objectiveResult, actionsResult, evidenceResult, checkInResult, documentResult]) {
      if (result.error) throw result.error;
    }

    expect(objectiveResult.data).toMatchObject({ current: "50%", target: "60%", status: "at_risk", progress: 50 });
    expect(actionsResult.data?.filter((action) => action.status === "done")).toHaveLength(2);
    expect(actionsResult.data?.find((action) => action.id === actionIds[2])).toMatchObject({ status: "late", deadline: "2027-07-20" });
    expect(evidenceResult.data?.text).toBe("Relatório semanal de Jun 2027");
    expect((checkInResult.data?.details as any).managementPulse).toMatchObject({ confidence: "yellow", blocker: "dependência externa do fornecedor" });

    const content = documentResult.data?.content as any;
    expect(content.objetivos[0]).toMatchObject({ atual: "50%", meta: "60%" });
    expect(content.fechamento.aprendizados).toEqual(["Envolver o fornecedor no início do próximo ciclo"]);
    expect(content.fechamento.pendencias[0]).toContain("renegociar");
    expect(content.fechamento.pendencias[0]).toContain("novo prazo: 2027-07-20");
    expect(content.fechamento.pendencias[0]).not.toContain("[object Object]");
    expect(content.fechamento.pulso_gestao).toMatchObject({ confianca: "yellow", bloqueio: "dependência externa do fornecedor" });

    const whatsapp = renderPlanForWhatsApp(content);
    expect(whatsapp).toContain("Meta: 60%");
    expect(whatsapp).toContain("Aprendizados: Envolver o fornecedor no início do próximo ciclo");
    expect(whatsapp).toContain("Confiança: yellow");
    expect(whatsapp).not.toContain("[object Object]");
  }, 60_000);
});
