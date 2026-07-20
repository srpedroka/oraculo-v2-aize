import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PlanDocumentView } from "../../src/components/PlanDocument";
import type { PlanDocument } from "../../src/types";
import { renderPlanDocumentPdf } from "../../supabase/functions/_shared/plan-pdf";
import { renderPlanForWhatsApp } from "../../supabase/functions/_shared/plan-render";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;
const FUNCTIONS_URL = `${process.env.SUPABASE_STAGING_URL}/functions/v1/oracle-session`;

let org: DisposableOrg;
let ownerJwt = "";
let report: Record<string, unknown> | null = null;
const admin = RUN ? serviceClient() : (null as ReturnType<typeof serviceClient>);

function stableFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizedOutput(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function assertFacts(output: string, facts: string[], channel: string) {
  const normalized = normalizedOutput(output);
  for (const fact of facts) {
    expect(normalized, `${channel} omitiu: ${fact}`).toContain(normalizedOutput(fact));
  }
}

async function extractPdfText(bytes: Uint8Array) {
  const standardFontDataUrl = `${resolve("node_modules/pdfjs-dist/standard_fonts")}/`;
  const pdf = await getDocument({ data: new Uint8Array(bytes), standardFontDataUrl }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
  }
  return pages.join("\n");
}

async function seedSession(fields: Record<string, unknown>) {
  const { data, error } = await admin
    .from("planning_sessions")
    .insert({ phase: "confirmacao", status: "active", state: {}, ...fields })
    .select("id")
    .single();
  if (error || !data) throw new Error(`falha ao criar sessão Q4E: ${error?.message}`);
  return data.id as string;
}

async function confirm(sessionId: string, channel: "web" | "whatsapp" = "web") {
  const response = await fetch(FUNCTIONS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${ownerJwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "confirm", sessionId, channel }),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

async function outputMutationSnapshot(orgId: string) {
  const tables = ["objectives", "key_actions", "plan_documents", "ai_usage_logs"];
  const entries = await Promise.all(tables.map(async (table) => {
    const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq("org_id", orgId);
    if (error) throw error;
    return [table, count ?? 0] as const;
  }));
  return Object.fromEntries(entries);
}

d("Q4E — igualdade material e rastreabilidade das saídas", () => {
  beforeAll(async () => {
    org = await createDisposableOrg("q4e-output-equality");
    const { data, error } = await anonClient().auth.signInWithPassword({ email: org.owner.email, password: org.owner.password });
    if (error || !data.session) throw new Error(`login do owner Q4E falhou: ${error?.message}`);
    ownerJwt = data.session.access_token;
  }, 60_000);

  afterAll(async () => {
    if (org) await destroyDisposableOrg(org);
    if (report && process.env.ORACULO_Q4E_REPORT === "1") {
      const directory = resolve(".agents-private");
      mkdirSync(directory, { recursive: true });
      const path = resolve(directory, `strategic-q4e-output-equality-${Date.now()}.json`);
      writeFileSync(path, `${JSON.stringify({ ...report, cleanupSucceeded: true }, null, 2)}\n`, { mode: 0o600 });
      console.log(`Relatório Q4E: ${path}`);
    }
  }, 60_000);

  it("mantém proposta, banco, documento, tela, PDF e WhatsApp equivalentes", async () => {
    const rootTitle = "Aumentar previsibilidade comercial em 2027";
    const annualTitle = "Tornar o funil comercial previsível";
    const objectiveTitle = "Elevar a disciplina de atualização do CRM";
    const result = "Elevar vendedores com próxima ação registrada de 40% para 85%";
    const metric = "Vendedores com próxima ação registrada";
    const baseline = "40%";
    const target = "85%";
    const source = "Relatório semanal de qualidade do CRM";
    const deadline = "2027-09-30";
    const owner = "PERSON_FIXTURE_MANAGER";
    const actionOne = "Treinar líderes de equipe no novo ritual do CRM";
    const actionTwo = "Publicar painel semanal de aderência por equipe";
    const criterionOne = "Todos os líderes treinados e presença registrada";
    const criterionTwo = "Painel publicado com atualização automática";

    const { data: root, error: rootError } = await admin.from("objectives").insert({
      org_id: org.orgId, area_id: null, level: "strategic", type: "harvest", title: rootTitle,
      result: rootTitle, metric: "Acurácia da previsão", current: "52%", target: "80%",
      deadline: "2027-12-31", owner, evidence_plan: "Relatório executivo", status: "on_track", progress: 0, period: "2027",
    }).select("id").single();
    if (rootError || !root) throw rootError ?? new Error("objetivo raiz Q4E ausente");

    const { data: annual, error: annualError } = await admin.from("objectives").insert({
      org_id: org.orgId, area_id: org.areas.comercialId, level: "area_annual", type: "harvest", title: annualTitle,
      result: annualTitle, metric: "Confiabilidade do funil", current: "45%", target: "80%",
      deadline: "2027-12-31", owner, evidence_plan: "CRM", status: "on_track", progress: 0,
      parent_id: root.id, period: "2027",
    }).select("id, title").single();
    if (annualError || !annual) throw annualError ?? new Error("objetivo anual Q4E ausente");

    const proposal = {
      type: "save_quarterly_plan",
      period: "T3 2027",
      areaRole: { mission: "Dar previsibilidade à receita", contribution: ["Manter o funil confiável"] },
      diagnosis: { strengths: ["Liderança experiente"], weaknesses: ["Atualização irregular do CRM"] },
      annualAlignment: { status: "linked", strategicObjectiveTitle: annualTitle },
      linkedStrategicObjectiveIds: [root.id],
      annualObjectives: [],
      quarterlyObjectives: [{
        title: objectiveTitle, result, metric, current: baseline, target, source, deadline, owner,
        parentTitle: annualTitle, period: "T3 2027", deliverables: ["Ritual semanal implantado"],
        actions: [
          { description: actionOne, completionCriterion: criterionOne, deadline: "2027-08-15", owner },
          { description: actionTwo, completionCriterion: criterionTwo, deadline: "2027-08-31", owner },
        ],
      }],
      risks: ["Líderes não sustentarem a rotina"],
      tradeOffs: ["Adiar automações secundárias"],
      cadence: "Revisão semanal às segundas-feiras",
      learningFocus: ["Descobrir qual equipe precisa de apoio adicional"],
    };
    const sessionId = await seedSession({
      org_id: org.orgId, area_id: org.areas.comercialId, user_id: org.owner.id,
      type: "quarterly", period: "T3 2027", pending_proposal: proposal,
    });

    const confirmation = await confirm(sessionId);
    expect(confirmation.status, JSON.stringify(confirmation.body)).toBe(200);

    const beforeRepeatedConfirmation = await outputMutationSnapshot(org.orgId);
    const repeatedConfirmation = await confirm(sessionId);
    const afterRepeatedConfirmation = await outputMutationSnapshot(org.orgId);
    expect(repeatedConfirmation.status, JSON.stringify(repeatedConfirmation.body)).toBe(200);
    expect(repeatedConfirmation.body.replayed).toBe(true);
    expect((repeatedConfirmation.body.document as Record<string, unknown>)?.id).toBeTruthy();
    expect(afterRepeatedConfirmation).toEqual(beforeRepeatedConfirmation);

    const beforeWhatsAppReplay = await outputMutationSnapshot(org.orgId);
    const whatsappReplay = await confirm(sessionId, "whatsapp");
    const afterWhatsAppReplay = await outputMutationSnapshot(org.orgId);
    expect(whatsappReplay.status, JSON.stringify(whatsappReplay.body)).toBe(200);
    expect(whatsappReplay.body.replayed).toBe(true);
    expect((whatsappReplay.body.document as Record<string, unknown>)?.id)
      .toBe((repeatedConfirmation.body.document as Record<string, unknown>)?.id);
    expect(afterWhatsAppReplay).toEqual(beforeWhatsAppReplay);

    const [{ data: objective, error: objectiveError }, { data: document, error: documentError }] = await Promise.all([
      admin.from("objectives").select("*").eq("org_id", org.orgId).eq("title", objectiveTitle).single(),
      admin.from("plan_documents").select("*").eq("session_id", sessionId).eq("type", "quarterly").single(),
    ]);
    if (objectiveError || !objective) throw objectiveError ?? new Error("objetivo gravado Q4E ausente");
    if (documentError || !document) throw documentError ?? new Error("documento Q4E ausente");
    const { data: actions, error: actionsError } = await admin.from("key_actions").select("*").eq("objective_id", objective.id).order("deadline");
    if (actionsError) throw actionsError;

    const proposalSemantic = {
      period: proposal.period,
      annualLink: annualTitle,
      objective: { title: objectiveTitle, result, metric, baseline, target, source, deadline, owner },
      actions: [
        { description: actionOne, criterion: criterionOne, deadline: "2027-08-15", owner },
        { description: actionTwo, criterion: criterionTwo, deadline: "2027-08-31", owner },
      ],
    };
    const databaseSemantic = {
      period: objective.period,
      annualLink: annual.title,
      objective: {
        title: objective.title, result: objective.result, metric: objective.metric, baseline: objective.current,
        target: objective.target, source: objective.evidence_plan, deadline: objective.deadline, owner: objective.owner,
      },
      actions: (actions ?? []).map((action) => ({
        description: action.description, criterion: action.completion_criterion, deadline: action.deadline, owner: action.owner,
      })),
    };
    const content = document.content as Record<string, any>;
    const canonicalObjective = (content.objetivos as Array<Record<string, any>>)[0];
    const documentSemantic = {
      period: content.periodo,
      annualLink: canonicalObjective.vinculo,
      objective: {
        title: canonicalObjective.titulo, result: canonicalObjective.resultado, metric: canonicalObjective.indicador,
        baseline: canonicalObjective.atual, target: canonicalObjective.meta, source: canonicalObjective.fonte,
        deadline: canonicalObjective.prazo, owner: canonicalObjective.responsavel,
      },
      actions: (canonicalObjective.acoes as Array<Record<string, any>>).map((action) => ({
        description: action.descricao, criterion: action.criterio, deadline: action.prazo, owner: action.responsavel,
      })),
    };

    expect(databaseSemantic).toEqual(proposalSemantic);
    expect(documentSemantic).toEqual(proposalSemantic);
    expect(document.origin).toBe("session");
    expect(document.version).toBe(1);
    expect(content.rastreabilidade).toMatchObject({ schema_version: 1, origem: "proposta_confirmada", tipo_sessao: "quarterly" });

    const appDocument: PlanDocument = {
      id: document.id, orgId: document.org_id, areaId: document.area_id, sessionId: document.session_id,
      type: document.type, origin: document.origin, period: document.period, title: document.title,
      content, version: document.version, createdBy: document.created_by, createdAt: document.created_at,
    };
    const beforeRender = await outputMutationSnapshot(org.orgId);
    const web = renderToStaticMarkup(createElement(PlanDocumentView, { document: appDocument }));
    const whatsapp = renderPlanForWhatsApp(content, document);
    const pdf = await renderPlanDocumentPdf(document);
    const pdfText = await extractPdfText(pdf.bytes);
    const afterRender = await outputMutationSnapshot(org.orgId);
    expect(afterRender).toEqual(beforeRender);
    expect(afterRender.ai_usage_logs).toBe(0);
    const materialFacts = [
      "T3 2027", annualTitle, objectiveTitle, result, metric, baseline, target, source, deadline, owner,
      actionOne, criterionOne, "2027-08-15", actionTwo, criterionTwo, "2027-08-31",
      "Versão 1", "Proposta confirmada",
    ];
    assertFacts(web, materialFacts, "tela");
    assertFacts(whatsapp, materialFacts, "WhatsApp");
    assertFacts(pdfText, materialFacts, "PDF");

    const fingerprint = stableFingerprint(proposalSemantic);
    expect(stableFingerprint(databaseSemantic)).toBe(fingerprint);
    expect(stableFingerprint(documentSemantic)).toBe(fingerprint);
    report = {
      schemaVersion: 1,
      gate: "Q4E",
      status: "approved",
      checkedChannels: ["proposal", "database", "canonical_document", "web", "pdf", "whatsapp"],
      semanticFingerprint: fingerprint,
      materialFactCount: materialFacts.length,
      documentVersion: document.version,
      costUsd: 0,
    };
  }, 90_000);
});
