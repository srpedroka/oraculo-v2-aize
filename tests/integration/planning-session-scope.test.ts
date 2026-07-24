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

async function startReview(sourceDocumentId: string, period = "2026") {
  const response = await fetch(FUNCTIONS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${ownerJwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "start",
      orgId: org.orgId,
      areaId: null,
      type: "strategic_review",
      period,
      sourceDocumentId,
      reviewIntent: "apply_existing_review",
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

  it("inicia a aplicação contextual de uma revisão preservada", async () => {
    const { data: review, error } = await admin
      .from("plan_documents")
      .insert({
        org_id: org.orgId,
        area_id: null,
        session_id: null,
        type: "strategic_review",
        origin: "session",
        period: "2026",
        title: "Revisão Semestral 2026",
        content: {
          ciclo_revisao: "midyear",
          plano_anual_original_preservado: true,
          atualizacao_plano_anual: { modo: "preserve" },
          revisao_semestre: { resumo_executivo: "Priorizar produtividade no segundo semestre." },
        },
        version: 1,
        created_by: org.owner.id,
      })
      .select("id")
      .single();
    if (error) throw error;

    const result = await startReview(review.id);

    expect(result.status).toBe(200);
    expect(result.body.session).toMatchObject({
      type: "strategic_review",
      period: "2026",
      phase: "decisoes_segundo_semestre",
      state: {
        review_intent: "apply_existing_review",
        source_review_document_id: review.id,
        required_annual_plan_mode: "update_current_year",
      },
    });
    expect(String(result.body.reply)).toContain("Vinculei “Revisão Semestral 2026”");

    const { data: messages, error: messageError } = await admin
      .from("chat_messages")
      .select("text")
      .eq("conversation_id", result.body.session.conversation_id)
      .eq("author", "oracle");
    if (messageError) throw messageError;
    expect(messages?.some((message) => String(message.text).includes("uma única confirmação"))).toBe(true);
  });

  it("recusa uma revisão que não pertence à empresa", async () => {
    const result = await startReview("00000000-0000-4000-8000-000000000001");

    expect(result.status).toBe(400);
    expect(String(result.body.error)).toContain("não está disponível nesta empresa");
  });

  it("recusa revisão de outro ano ou já aplicada", async () => {
    const { data: reviews, error } = await admin
      .from("plan_documents")
      .insert([
        {
          org_id: org.orgId,
          area_id: null,
          session_id: null,
          type: "strategic_review",
          origin: "session",
          period: "2025",
          title: "Revisão Semestral 2025",
          content: { ciclo_revisao: "midyear", atualizacao_plano_anual: { modo: "preserve" } },
          version: 1,
          created_by: org.owner.id,
        },
        {
          org_id: org.orgId,
          area_id: null,
          session_id: null,
          type: "strategic_review",
          origin: "session",
          period: "2026",
          title: "Revisão Semestral 2026 aplicada",
          content: {
            ciclo_revisao: "midyear",
            plano_anual_atualizado: true,
            atualizacao_plano_anual: { modo: "update_current_year" },
          },
          version: 2,
          created_by: org.owner.id,
        },
      ])
      .select("id,period");
    if (error) throw error;

    const otherYear = await startReview(reviews.find((review) => review.period === "2025")!.id);
    const alreadyApplied = await startReview(reviews.find((review) => review.period === "2026")!.id);

    expect(otherYear.status).toBe(400);
    expect(String(otherYear.body.error)).toContain("outro ano");
    expect(alreadyApplied.status).toBe(400);
    expect(String(alreadyApplied.body.error)).toContain("já gerou");
  });
});
