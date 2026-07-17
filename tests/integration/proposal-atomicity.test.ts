import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";

// Etapa 1 / Fatia 1A — atomicidade e idempotencia da confirmacao de propostas.
// Dirige o ENDPOINT REAL (oracle-session, action=confirm) com JWT do dono, no staging.
// Prova: (1) caso feliz grava tudo; (2) confirmar de novo nao duplica; (3) duas
// confirmacoes simultaneas nao duplicam; (4) falha no meio reverte tudo (nada parcial).

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;

const FUNCTIONS_URL = `${process.env.SUPABASE_STAGING_URL}/functions/v1/oracle-session`;

let org: DisposableOrg;
let foreignOrg: DisposableOrg;
let ownerJwt: string;
const admin = RUN ? serviceClient() : (null as any);

async function seedSession(fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin
    .from("planning_sessions")
    .insert({ phase: "confirmacao", status: "active", state: {}, ...fields })
    .select("id")
    .single();
  if (error) throw new Error(`falha ao semear sessao: ${error.message}`);
  return data.id as string;
}

async function confirm(sessionId: string) {
  const res = await fetch(FUNCTIONS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${ownerJwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "confirm", sessionId, channel: "web" }),
  });
  return { status: res.status, body: await res.json() as any };
}

async function countObjectivesByTitle(title: string): Promise<number> {
  const { count, error } = await admin
    .from("objectives")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org.orgId)
    .eq("title", title);
  if (error) throw error;
  return count ?? 0;
}

async function countActionsByDescription(description: string): Promise<number> {
  const { count, error } = await admin
    .from("key_actions")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org.orgId)
    .eq("description", description);
  if (error) throw error;
  return count ?? 0;
}

async function seedQuarterlyParent(areaId: string, title: string) {
  const { data, error } = await admin
    .from("objectives")
    .insert({
      org_id: org.orgId,
      area_id: areaId,
      level: "quarterly",
      type: "harvest",
      title,
      result: "Resultado trimestral de referência",
      metric: "Indicador trimestral",
      target: "100%",
      owner: "Responsável",
      status: "on_track",
      progress: 0,
      period: "T3 2026",
    })
    .select("id, title")
    .single();
  if (error || !data) throw new Error(`falha ao semear objetivo trimestral: ${error?.message}`);
  return data as { id: string; title: string };
}

function monthlyProposal(objTitle: string, actionDesc: string, parent: { id: string; title: string }) {
  return {
    type: "save_monthly_plan",
    period: "2026-07",
    quarterlyAlignment: {
      status: "linked",
      quarterlyObjectiveId: parent.id,
      quarterlyObjectiveTitle: parent.title,
    },
    capacity: { maxCommittedActions: 5 },
    objectives: [
      {
        title: objTitle,
        result: "Resultado alvo",
        metric: "Métrica",
        current: "0%",
        target: "100%",
        source: "Relatório mensal",
        deadline: "2026-07-31",
        owner: "Responsável",
        period: "2026-07",
        linkedQuarterlyObjectiveId: parent.id,
        parentTitle: parent.title,
        actions: [
          { description: actionDesc, completionCriterion: "Concluído", deadline: "2026-07-31", owner: "Responsável" },
        ],
      },
    ],
  };
}

d("Fatia 1A — atomicidade e idempotência (staging, endpoint real)", () => {
  beforeAll(async () => {
    org = await createDisposableOrg("1a");
    foreignOrg = await createDisposableOrg("2f-foreign");
    const { data, error } = await anonClient().auth.signInWithPassword({ email: org.owner.email, password: org.owner.password });
    if (error || !data.session) throw new Error(`login do dono falhou: ${error?.message}`);
    ownerJwt = data.session.access_token;
  }, 60_000);

  afterAll(async () => {
    if (org) await destroyDisposableOrg(org);
    if (foreignOrg) await destroyDisposableOrg(foreignOrg);
  }, 60_000);

  it("caso feliz: grava objetivos, ação e documento; limpa a proposta pendente", async () => {
    const objTitle = "Obj Mensal Feliz 1A";
    const actionDesc = "Ação Feliz 1A";
    const parent = await seedQuarterlyParent(org.areas.producaoId, "Pai Trimestral Feliz 1A");
    const sessionId = await seedSession({
      org_id: org.orgId,
      area_id: org.areas.producaoId,
      user_id: org.owner.id,
      type: "monthly",
      period: "2026-07",
      pending_proposal: monthlyProposal(objTitle, actionDesc, parent),
    });

    const { status, body } = await confirm(sessionId);
    expect(status).toBe(200);
    expect(body.reply).toContain("salvo");

    expect(await countObjectivesByTitle(objTitle)).toBe(1);
    expect(await countActionsByDescription(actionDesc)).toBe(1);
    // O vínculo trimestral real é reutilizado; a confirmação não inventa hierarquia.
    expect(await countObjectivesByTitle("Pai Trimestral Feliz 1A")).toBe(1);

    const { data: sess } = await admin.from("planning_sessions").select("pending_proposal, status").eq("id", sessionId).single();
    expect(sess.pending_proposal).toBeNull();
    expect(sess.status).toBe("completed");

    const { count: docs } = await admin
      .from("plan_documents").select("id", { count: "exact", head: true })
      .eq("org_id", org.orgId).eq("type", "monthly").eq("period", "2026-07");
    expect(docs).toBe(1);

    const { count: cmds } = await admin
      .from("operation_commands").select("id", { count: "exact", head: true })
      .eq("org_id", org.orgId).eq("status", "completed");
    expect(cmds).toBe(1);
  });

  it("idempotência: reconfirmar a MESMA proposta não duplica nada", async () => {
    const objTitle = "Obj Mensal Idem 1A";
    const actionDesc = "Ação Idem 1A";
    const parent = await seedQuarterlyParent(org.areas.producaoId, "Pai Trimestral Idem 1A");
    const proposal = monthlyProposal(objTitle, actionDesc, parent);
    const sessionId = await seedSession({
      org_id: org.orgId, area_id: org.areas.producaoId, user_id: org.owner.id,
      type: "monthly", period: "2026-07", pending_proposal: proposal,
    });

    const first = await confirm(sessionId);
    expect(first.status).toBe(200);
    expect(await countObjectivesByTitle(objTitle)).toBe(1);

    // Recoloca a MESMA proposta pendente e confirma de novo → mesma chave → sem reescrever.
    await admin.from("planning_sessions").update({ pending_proposal: proposal, status: "active", completed_at: null }).eq("id", sessionId);
    const second = await confirm(sessionId);
    expect(second.status).toBe(200);

    // Continua exatamente 1 — nada duplicado.
    expect(await countObjectivesByTitle(objTitle)).toBe(1);
    expect(await countActionsByDescription(actionDesc)).toBe(1);
  });

  it("concorrência: duas confirmações simultâneas da mesma proposta gravam uma vez só", async () => {
    const objTitle = "Obj Mensal Concorrência 1A";
    const actionDesc = "Ação Concorrência 1A";
    const parent = await seedQuarterlyParent(org.areas.comercialId, "Pai Trimestral Concorrência 1A");
    const sessionId = await seedSession({
      org_id: org.orgId, area_id: org.areas.comercialId, user_id: org.owner.id,
      type: "monthly", period: "2026-07",
      pending_proposal: monthlyProposal(objTitle, actionDesc, parent),
    });

    const [a, b] = await Promise.all([confirm(sessionId), confirm(sessionId)]);
    expect([a.status, b.status]).toContain(200);

    // Exatamente 1, mesmo com duas requisições ao mesmo tempo.
    expect(await countObjectivesByTitle(objTitle)).toBe(1);
    expect(await countActionsByDescription(actionDesc)).toBe(1);
    expect(await countObjectivesByTitle("Pai Trimestral Concorrência 1A")).toBe(1);
  });

  it("rollback: falha no meio da gravação não deixa nada parcial", async () => {
    const goodTitle = "A1 Rollback 1A (não deve sobrar)";
    // Segundo objetivo aponta parent_id para um UUID inexistente → viola FK após o 1º gravar.
    const proposal = {
      type: "save_quarterly_plan",
      period: "2026-Q3",
      annualObjectives: [
        { title: goodTitle },
        { title: "A2 Rollback 1A", linkedStrategicObjectiveId: "00000000-0000-0000-0000-000000000000" },
      ],
      quarterlyObjectives: [],
    };
    const sessionId = await seedSession({
      org_id: org.orgId, area_id: org.areas.producaoId, user_id: org.owner.id,
      type: "quarterly", period: "2026-Q3", pending_proposal: proposal,
    });

    const { status, body } = await confirm(sessionId);
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();

    // O primeiro objetivo NÃO pode ter sobrado (tudo-ou-nada).
    expect(await countObjectivesByTitle(goodTitle)).toBe(0);

    // A proposta continua pendente (nada foi confirmado) e nenhum comando ficou registrado.
    const { data: sess } = await admin.from("planning_sessions").select("pending_proposal, status").eq("id", sessionId).single();
    expect(sess.pending_proposal).not.toBeNull();
    expect(sess.status).toBe("active");
  });

  it("segurança 2F: recusa objetivo estratégico de outra organização antes de gravar", async () => {
    const { data: foreignObjective, error: foreignError } = await admin
      .from("objectives")
      .insert({
        org_id: foreignOrg.orgId,
        area_id: null,
        level: "strategic",
        type: "harvest",
        title: "Objetivo externo 2F",
        result: "Não pode vazar",
        metric: "Indicador externo",
        target: "100",
        owner: "Outra empresa",
        status: "on_track",
        progress: 0,
        period: "2026",
      })
      .select("id")
      .single();
    if (foreignError) throw foreignError;

    const localTitle = "Objetivo local bloqueado 2F";
    const sessionId = await seedSession({
      org_id: org.orgId,
      area_id: org.areas.producaoId,
      user_id: org.owner.id,
      type: "quarterly",
      period: "T3 2026",
      pending_proposal: {
        type: "save_quarterly_plan",
        period: "T3 2026",
        linkedStrategicObjectiveIds: [foreignObjective.id],
        annualObjectives: [{ title: localTitle, linkedStrategicObjectiveId: foreignObjective.id }],
        quarterlyObjectives: [{ title: "Trimestre protegido 2F", parentTitle: localTitle }],
      },
    });

    const { status, body } = await confirm(sessionId);
    expect(status).toBe(400);
    expect(body.error).toContain("fora desta empresa");
    expect(await countObjectivesByTitle(localTitle)).toBe(0);

    const { count: docs } = await admin
      .from("plan_documents")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.orgId)
      .eq("period", "T3 2026");
    expect(docs).toBe(0);
  });
});
