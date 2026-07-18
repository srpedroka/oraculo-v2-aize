import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;
const FUNCTIONS_URL = `${process.env.SUPABASE_STAGING_URL}/functions/v1/oracle-session`;
const admin = RUN ? serviceClient() : (null as ReturnType<typeof serviceClient>);

let org: DisposableOrg;
let ownerJwt = "";

d("retomada de sessao em um novo episodio", () => {
  beforeAll(async () => {
    org = await createDisposableOrg("planning-conversation-rebind");
    const login = await anonClient().auth.signInWithPassword({
      email: org.owner.email,
      password: org.owner.password,
    });
    if (login.error || !login.data.session) throw login.error ?? new Error("login do owner falhou");
    ownerJwt = login.data.session.access_token;
  }, 60_000);

  afterAll(async () => {
    if (org) await destroyDisposableOrg(org);
  }, 60_000);

  it("move a sessao arquivada para a conversa ativa antes de gravar a mensagem", async () => {
    const oldTimestamp = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const { data: archived, error: archivedError } = await admin.from("conversations").insert({
      org_id: org.orgId,
      user_id: org.owner.id,
      area_id: org.areas.comercialId,
      channel: "web",
      status: "archived",
      last_message_at: oldTimestamp,
    }).select("id").single();
    if (archivedError || !archived) throw archivedError ?? new Error("conversa arquivada nao criada");

    const { data: active, error: activeError } = await admin.from("conversations").insert({
      org_id: org.orgId,
      user_id: org.owner.id,
      area_id: org.areas.comercialId,
      channel: "web",
      status: "active",
    }).select("id").single();
    if (activeError || !active) throw activeError ?? new Error("conversa ativa nao criada");

    const { data: session, error: sessionError } = await admin.from("planning_sessions").insert({
      org_id: org.orgId,
      area_id: org.areas.comercialId,
      user_id: org.owner.id,
      conversation_id: archived.id,
      type: "quarterly",
      period: "T3 2026",
      phase: "abertura",
      state: { periodo: "T3 2026" },
      status: "active",
    }).select("id").single();
    if (sessionError || !session) throw sessionError ?? new Error("sessao nao criada");

    const marker = `retomada-visivel-${Date.now()}`;
    const response = await fetch(FUNCTIONS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${ownerJwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "message", sessionId: session.id, channel: "web", message: marker }),
    });
    const payload = await response.json() as Record<string, unknown>;
    expect(response.status, JSON.stringify(payload)).toBe(400);
    expect(String(payload.error)).toContain("IA de planejamento não configurada");

    const { data: rebound, error: reboundError } = await admin.from("planning_sessions")
      .select("conversation_id")
      .eq("id", session.id)
      .single();
    if (reboundError) throw reboundError;
    expect(rebound.conversation_id).toBe(active.id);

    const { data: messages, error: messagesError } = await admin.from("chat_messages")
      .select("conversation_id, text")
      .eq("org_id", org.orgId)
      .eq("text", marker);
    if (messagesError) throw messagesError;
    expect(messages).toEqual([{ conversation_id: active.id, text: marker }]);
  });
});
