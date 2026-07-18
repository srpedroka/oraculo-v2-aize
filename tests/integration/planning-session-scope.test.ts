import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;
const FUNCTIONS_URL = `${process.env.SUPABASE_STAGING_URL}/functions/v1/oracle-session`;

let org: DisposableOrg;
let ownerJwt: string;
const admin = RUN ? serviceClient() : (null as any);

async function startQuarterly(areaId: string | null) {
  const response = await fetch(FUNCTIONS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${ownerJwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "start",
      orgId: org.orgId,
      areaId,
      type: "quarterly",
      period: "T3 2026",
      channel: "web",
    }),
  });
  return { status: response.status, body: await response.json() as any };
}

async function bindSessionArea(sessionId: string, areaId: string) {
  const response = await fetch(FUNCTIONS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${ownerJwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "bind_area",
      sessionId,
      areaId,
      channel: "web",
    }),
  });
  return { status: response.status, body: await response.json() as any };
}

d("escopo de sessões de planejamento", () => {
  beforeAll(async () => {
    org = await createDisposableOrg("planning-scope");
    const login = await anonClient().auth.signInWithPassword({ email: org.owner.email, password: org.owner.password });
    if (login.error || !login.data.session) throw login.error ?? new Error("login do owner falhou");
    ownerJwt = login.data.session.access_token;
  }, 60_000);

  afterAll(async () => {
    if (org) await destroyDisposableOrg(org);
  }, 60_000);

  it("mantém Comercial/T3 separado de Produção/T3", async () => {
    const commercial = await startQuarterly(org.areas.comercialId);
    const production = await startQuarterly(org.areas.producaoId);

    expect(commercial.status).toBe(200);
    expect(production.status).toBe(200);
    expect(production.body.session.id).not.toBe(commercial.body.session.id);
    expect(commercial.body.session.area_id).toBe(org.areas.comercialId);
    expect(production.body.session.area_id).toBe(org.areas.producaoId);

    const { count, error } = await admin
      .from("planning_sessions")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.orgId)
      .eq("type", "quarterly")
      .eq("period", "T3 2026")
      .eq("status", "active");
    if (error) throw error;
    expect(count).toBe(2);
  });

  it("recusa plano trimestral sem área", async () => {
    const result = await startQuarterly(null);
    expect(result.status).toBe(400);
    expect(String(result.body.error)).toContain("área");
  });

  it("recupera sessão legada somente com área explícita e preserva a proposta", async () => {
    const pendingProposal = {
      type: "quarterly_plan",
      summary: "Proposta legada preservada",
      objectives: [],
      actions: [],
    };
    const { data: conversation, error: conversationError } = await admin
      .from("conversations")
      .insert({
        org_id: org.orgId,
        user_id: org.owner.id,
        area_id: null,
        channel: "web",
        status: "active",
      })
      .select("id")
      .single();
    if (conversationError || !conversation) throw conversationError ?? new Error("conversa legada não criada");

    const { data: session, error: sessionError } = await admin
      .from("planning_sessions")
      .insert({
        org_id: org.orgId,
        user_id: org.owner.id,
        area_id: null,
        conversation_id: conversation.id,
        type: "quarterly",
        period: "T4 2026",
        phase: "sintese",
        state: { periodo: "T4 2026" },
        pending_proposal: pendingProposal,
        status: "active",
      })
      .select("id")
      .single();
    if (sessionError || !session) throw sessionError ?? new Error("sessão legada não criada");

    const bound = await bindSessionArea(session.id, org.areas.comercialId);
    expect(bound.status).toBe(200);
    expect(bound.body.session.area_id).toBe(org.areas.comercialId);
    expect(bound.body.session.pending_proposal).toEqual(pendingProposal);

    const [{ data: storedSession, error: storedSessionError }, { data: storedConversation, error: storedConversationError }] = await Promise.all([
      admin.from("planning_sessions").select("area_id, conversation_id, pending_proposal, status").eq("id", session.id).single(),
      admin.from("conversations").select("area_id").eq("id", conversation.id).single(),
    ]);
    if (storedSessionError) throw storedSessionError;
    if (storedConversationError) throw storedConversationError;
    expect(storedSession.area_id).toBe(org.areas.comercialId);
    expect(storedSession.conversation_id).toBe(conversation.id);
    expect(storedSession.pending_proposal).toEqual(pendingProposal);
    expect(storedSession.status).toBe("active");
    expect(storedConversation.area_id).toBe(org.areas.comercialId);

    const repeated = await bindSessionArea(session.id, org.areas.comercialId);
    expect(repeated.status).toBe(200);

    const conflicting = await bindSessionArea(session.id, org.areas.producaoId);
    expect(conflicting.status).toBe(400);
    expect(String(conflicting.body.error)).toContain("outra área");
  });
});
