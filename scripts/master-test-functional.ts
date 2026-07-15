import { createHmac, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { anonClient, assertStaging, serviceClient } from "../tests/helpers/staging.ts";

const PRODUCTION_REF = "bkswkfazkjilwfzwzthz";
const BASELINE_PATH = resolve(".agents-private/master-test-7a.json");
const REPORT_PATH = resolve(".agents-private/master-test-7b.json");
const stagingUrl = process.env.SUPABASE_STAGING_URL ?? "";
const anonKey = process.env.SUPABASE_STAGING_ANON_KEY ?? "";

interface TestUser {
  id: string;
  email: string;
  password: string;
}

interface BaselineState {
  runId: string;
  stagingProjectRef: string;
  users: Record<"ownerA" | "adminA" | "productionCoordinator" | "commercialCoordinator" | "ownerB", TestUser>;
  orgA: {
    id: string;
    memberships: Record<"owner" | "admin" | "productionCoordinator" | "commercialCoordinator", string>;
    areas: Record<"production" | "commercial", string>;
  };
  orgB: { id: string };
  mfa: { factorId: string; secret: string };
}

interface BlockResult {
  status: "passed" | "limited";
  checks: string[];
  limitation?: string;
}

interface FunctionalReport {
  version: 1;
  runId: string;
  startedAt: string;
  completedAt?: string;
  stagingProjectRef: string;
  blocks: Partial<Record<"7B1" | "7B2" | "7B3" | "7B4", BlockResult>>;
  resources: {
    historicalDocumentIds: string[];
    sessionIds: string[];
    objectiveIds: string[];
    checkInId?: string;
    kpiDocumentId?: string;
    backupId?: string;
    restoreRunId?: string;
    cloneOrgId?: string;
  };
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`variável ${name} ausente para o Teste Mestre`);
  return value;
}

function stagingProjectRef() {
  if (!stagingUrl) throw new Error("SUPABASE_STAGING_URL ausente");
  const ref = new URL(stagingUrl).hostname.split(".")[0];
  if (!ref || ref === PRODUCTION_REF) throw new Error("RECUSADO: Teste Mestre nunca roda em produção");
  return ref;
}

function decodeBase32(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of value.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("segredo TOTP inválido");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function currentTotp(secret: string) {
  const counter = BigInt(Math.floor(Date.now() / 30_000));
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

async function readBaseline() {
  const state = JSON.parse(await readFile(BASELINE_PATH, "utf8")) as BaselineState;
  if (state.stagingProjectRef !== stagingProjectRef()) throw new Error("baseline pertence a outro staging");
  return state;
}

async function writeReport(report: FunctionalReport) {
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

async function aal2Session(state: BaselineState) {
  const client = anonClient();
  const signed = await client.auth.signInWithPassword({
    email: state.users.ownerA.email,
    password: state.users.ownerA.password,
  });
  if (signed.error || !signed.data.session) throw signed.error ?? new Error("login do owner MASTER ausente");
  const challenge = await client.auth.mfa.challenge({ factorId: state.mfa.factorId });
  if (challenge.error) throw challenge.error;
  const verified = await client.auth.mfa.verify({
    factorId: state.mfa.factorId,
    challengeId: challenge.data.id,
    code: currentTotp(state.mfa.secret),
  });
  if (verified.error) throw verified.error;
  return { client, token: verified.data.access_token };
}

async function callFunction(
  slug: string,
  token: string,
  body: Record<string, unknown>,
  requestId = `master-${randomUUID()}`,
) {
  const response = await fetch(`${stagingUrl}/functions/v1/${slug}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as Record<string, any>;
  if (!response.ok) throw new Error(`${slug} falhou (${response.status}): ${String(payload.error ?? "erro desconhecido")}`);
  return payload;
}

async function seedSession(state: BaselineState, values: Record<string, unknown>) {
  const result = await serviceClient().from("planning_sessions").insert({
    org_id: state.orgA.id,
    user_id: state.users.ownerA.id,
    phase: "confirmacao",
    status: "active",
    state: {},
    ...values,
  }).select("id").single();
  if (result.error || !result.data) throw result.error ?? new Error("sessão não criada");
  return String(result.data.id);
}

async function confirmSession(token: string, sessionId: string) {
  return callFunction("oracle-session", token, { action: "confirm", sessionId, channel: "web" });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function run7B2(state: BaselineState, token: string, report: FunctionalReport) {
  const admin = serviceClient();
  const marker = state.runId;
  const historical = await callFunction("save-historical-document", token, {
    orgId: state.orgA.id,
    documents: [
      {
        documentType: "strategic",
        period: "2025",
        title: `Histórico estratégico MASTER ${marker}`,
        rawText: "Em 2025 a empresa priorizou previsibilidade de receita e disciplina de margem. A principal lição foi limitar frentes simultâneas.",
        source: "teste-mestre-estrategico.txt",
        note: "Referência histórica controlada",
        summary: "Prioridade em receita previsível e margem.",
      },
      {
        areaId: state.orgA.areas.production,
        documentType: "quarterly",
        period: "T2 2026",
        title: `Histórico Produção MASTER ${marker}`,
        rawText: "Plano T2 da Produção: reduzir retrabalho, estabilizar a rotina diária e acompanhar volume produzido por semana.",
        source: "teste-mestre-producao.txt",
        summary: "Redução de retrabalho e estabilidade da produção.",
      },
      {
        areaId: state.orgA.areas.commercial,
        documentType: "monthly",
        period: "Jun 2026",
        title: `Histórico Comercial MASTER ${marker}`,
        rawText: "Plano mensal Comercial: organizar o funil, medir ticket médio e registrar a base ativa. O avanço foi parcial por falta de rotina.",
        source: "teste-mestre-comercial.txt",
        summary: "Funil, ticket médio e base ativa com avanço parcial.",
      },
    ],
  });
  const historicalIds = (historical.documents ?? []).map((item: any) => String(item.id));
  assert(historicalIds.length === 3, "7B2: lote histórico não gravou três documentos");
  report.resources.historicalDocumentIds = historicalIds;

  const strategicTitle = `Receita previsível MASTER ${marker}`;
  const strategicProposal = {
    type: "save_strategic_plan",
    year: 2026,
    drivers: { purpose: "Crescer com disciplina", vision: "Operação previsível", values: ["Clareza", "Execução"] },
    swot: { strengths: ["Conhecimento do mercado"], weaknesses: ["Dados dispersos"], opportunities: ["Nova carteira"], threats: ["Margem pressionada"] },
    themes: ["Previsibilidade com margem"],
    rituals: ["Revisão mensal por área"],
    executiveSummary: "Crescer receita com previsibilidade, margem e cadência de execução.",
    objectives: [{
      title: strategicTitle,
      type: "harvest",
      result: "Receita recorrente e previsível",
      metric: "Faturamento mensal",
      target: "R$ 1,25 milhão",
      owner: "Owner MASTER",
      period: "2026",
      kpiLinks: [{ kpiKey: "revenue", rationale: "Impacto direto no faturamento." }],
    }],
    projects: [{ name: `Projeto comercial MASTER ${marker}`, owner: "Owner MASTER", deadline: "2026-12-15", linkedObjectiveTitle: strategicTitle }],
  };
  const strategicSession = await seedSession(state, { type: "strategic", period: "2026", area_id: null, pending_proposal: strategicProposal });
  report.resources.sessionIds.push(strategicSession);
  await confirmSession(token, strategicSession);
  const strategic = await admin.from("objectives").select("id").eq("org_id", state.orgA.id).eq("title", strategicTitle).single();
  if (strategic.error || !strategic.data) throw strategic.error ?? new Error("objetivo estratégico não gravado");
  const strategicId = String(strategic.data.id);
  report.resources.objectiveIds.push(strategicId);

  const reseed = await admin.from("planning_sessions").update({ pending_proposal: strategicProposal, status: "active", completed_at: null }).eq("id", strategicSession);
  if (reseed.error) throw reseed.error;
  await confirmSession(token, strategicSession);
  const strategicCount = await admin.from("objectives").select("id", { count: "exact", head: true }).eq("org_id", state.orgA.id).eq("title", strategicTitle);
  assert(strategicCount.count === 1, "7B2: reconfirmação duplicou o objetivo estratégico");

  const annualTitle = `Estruturar Produção MASTER ${marker}`;
  const quarterlyTitle = `Reduzir retrabalho T3 MASTER ${marker}`;
  const quarterlyProposal = {
    type: "save_quarterly_plan",
    period: "T3 2026",
    linkedStrategicObjectiveIds: [strategicId],
    areaRole: { mission: "Entregar com qualidade e previsibilidade", contribution: ["Estabilidade operacional"] },
    diagnosis: { strengths: ["Equipe experiente"], weaknesses: ["Retrabalho"] },
    learningFocus: ["Ritual diário de produção"],
    annualObjectives: [{
      title: annualTitle,
      type: "seed",
      metric: "Índice de retrabalho",
      target: "Abaixo de 3%",
      owner: "Coordenação Produção",
      period: "2026",
      linkedStrategicObjectiveId: strategicId,
    }],
    quarterlyObjectives: [{
      title: quarterlyTitle,
      type: "harvest",
      metric: "Retrabalho",
      target: "3%",
      owner: "Coordenação Produção",
      period: "T3 2026",
      parentTitle: annualTitle,
      deliverables: ["Rotina diária ativa", "Painel semanal publicado"],
      kpiLinks: [{ kpiKey: "production", rationale: "Impacto direto no volume produzido." }],
    }],
  };
  const quarterlySession = await seedSession(state, {
    type: "quarterly",
    period: "T3 2026",
    area_id: state.orgA.areas.production,
    pending_proposal: quarterlyProposal,
  });
  report.resources.sessionIds.push(quarterlySession);
  await confirmSession(token, quarterlySession);
  const quarterly = await admin.from("objectives").select("id").eq("org_id", state.orgA.id).eq("title", quarterlyTitle).single();
  if (quarterly.error || !quarterly.data) throw quarterly.error ?? new Error("objetivo trimestral não gravado");
  const quarterlyId = String(quarterly.data.id);
  report.resources.objectiveIds.push(quarterlyId);

  const monthlyTitle = `Implantar rotina diária MASTER ${marker}`;
  const actionDescription = `Publicar painel semanal MASTER ${marker}`;
  const monthlyProposal = {
    type: "save_monthly_plan",
    period: "Jul 2026",
    context: ["A rotina diária sustenta a redução de retrabalho."],
    focusPhrase: "Estabilizar execução com dados simples.",
    objectives: [{
      title: monthlyTitle,
      type: "seed",
      result: "Rotina diária executada",
      metric: "Dias com ritual realizado",
      target: "20 dias",
      owner: "Coordenação Produção",
      period: "Jul 2026",
      parentTitle: quarterlyTitle,
      kpiLinks: [{ kpiKey: "production", rationale: "A rotina protege a produção." }],
      actions: [{
        description: actionDescription,
        completionCriterion: "Quatro painéis semanais publicados",
        deadline: "2026-07-31",
        owner: "Coordenação Produção",
      }],
    }],
  };
  const monthlySession = await seedSession(state, {
    type: "monthly",
    period: "Jul 2026",
    area_id: state.orgA.areas.production,
    pending_proposal: monthlyProposal,
  });
  report.resources.sessionIds.push(monthlySession);
  await confirmSession(token, monthlySession);
  const monthly = await admin.from("objectives").select("id").eq("org_id", state.orgA.id).eq("title", monthlyTitle).single();
  if (monthly.error || !monthly.data) throw monthly.error ?? new Error("objetivo mensal não gravado");
  const monthlyId = String(monthly.data.id);
  report.resources.objectiveIds.push(monthlyId);
  const action = await admin.from("key_actions").select("id").eq("org_id", state.orgA.id).eq("description", actionDescription).single();
  if (action.error || !action.data) throw action.error ?? new Error("ação mensal não gravada");

  const sessionDocs = await admin.from("plan_documents").select("id,type").eq("org_id", state.orgA.id).eq("origin", "session").in("session_id", report.resources.sessionIds);
  if (sessionDocs.error) throw sessionDocs.error;
  assert(new Set((sessionDocs.data ?? []).map((item) => item.type)).size === 3, "7B2: documentos canônicos de planejamento incompletos");

  report.blocks["7B2"] = {
    status: "limited",
    checks: [
      "lote de três históricos gravado pelo endpoint real",
      "plano estratégico confirmado e reconfirmação idempotente",
      "plano trimestral vinculado ao estratégico",
      "plano mensal com ação-chave e documentos canônicos",
    ],
    limitation: "Staging sem chave de provedor: geração textual pela IA não executada; proposta estruturada e confirmação server-side foram exercitadas.",
  };
  await writeReport(report);
  return { strategicId, quarterlyId, monthlyId, actionId: String(action.data.id) };
}

async function run7B3(
  state: BaselineState,
  token: string,
  ownerClient: Awaited<ReturnType<typeof aal2Session>>["client"],
  report: FunctionalReport,
  ids: { monthlyId: string; actionId: string },
) {
  const admin = serviceClient();
  const marker = state.runId;
  const monthCloseProposal = {
    type: "month_close",
    period: "Jul 2026",
    nextPeriod: "Ago 2026",
    summary: "Ritual diário estabilizado e painel semanal publicado.",
    completionRate: 100,
    reviews: [{
      objectiveId: ids.monthlyId,
      title: `Implantar rotina diária MASTER ${marker}`,
      statusFinal: "done",
      progressFinal: 100,
      evidence: "Quatro painéis semanais publicados e ritual realizado em 20 dias.",
      learning: "A cadência curta reduziu o retrabalho.",
      actions: [{ id: ids.actionId, status: "done" }],
    }],
    pendencies: [],
    managementPulse: {
      confidence: "green",
      confidenceReason: "A rotina está estável.",
      blocker: "",
      decisionNeeded: "",
      nextCommitment: "Manter quatro semanas consecutivas.",
    },
  };
  const closeSession = await seedSession(state, {
    type: "month_close",
    period: "Jul 2026",
    area_id: state.orgA.areas.production,
    pending_proposal: monthCloseProposal,
  });
  report.resources.sessionIds.push(closeSession);
  await confirmSession(token, closeSession);
  const checkIn = await admin.from("check_ins").select("id,details").eq("org_id", state.orgA.id).eq("area_id", state.orgA.areas.production).eq("period", "Jul 2026").single();
  if (checkIn.error || !checkIn.data) throw checkIn.error ?? new Error("revisão mensal não gravada");
  report.resources.checkInId = String(checkIn.data.id);
  assert(Number((checkIn.data.details as any)?.completionRate) === 100, "7B3: conclusão mensal divergente");

  const kpiImport = await callFunction("apply-kpi-import", token, {
    orgId: state.orgA.id,
    fileName: "master-kpis-jul-2026.xlsx",
    inputKind: "spreadsheet",
    applyToken: `master-kpi-${marker}`,
    suggestion: {
      year: 2026,
      rows: [{ kpiKey: "revenue", year: 2026, month: 7, targetValue: 1_250_000, actualValue: 1_175_000 }],
      summary: "Importação controlada do Teste Mestre",
      warnings: [],
    },
  });
  assert(kpiImport.appliedCount === 1, "7B3: importação de KPI não aplicou uma linha");
  report.resources.kpiDocumentId = String(kpiImport.document?.id ?? "");

  const kpis = await admin.from("executive_kpis").select("id,kpi_key").eq("org_id", state.orgA.id).in("kpi_key", ["revenue", "production"]);
  if (kpis.error || kpis.data?.length !== 2) throw kpis.error ?? new Error("KPIs do vínculo ausentes");
  await callFunction("set-objective-kpi-links", token, {
    orgId: state.orgA.id,
    objectiveId: ids.monthlyId,
    links: kpis.data.map((kpi) => ({ kpiId: kpi.id, rationale: `Vínculo MASTER ${kpi.kpi_key}`, confidence: 1 })),
  });
  const links = await admin.from("objective_kpi_links").select("id").eq("org_id", state.orgA.id).eq("objective_id", ids.monthlyId);
  if (links.error) throw links.error;
  assert((links.data?.length ?? 0) === 2, "7B3: vínculos objetivo-KPI incompletos");

  await callFunction("operational-lifecycle", token, {
    orgId: state.orgA.id,
    entityType: "objective",
    entityId: ids.monthlyId,
    archived: true,
    reason: "Teste Mestre de arquivo reversível",
  });
  await callFunction("operational-lifecycle", token, {
    orgId: state.orgA.id,
    entityType: "objective",
    entityId: ids.monthlyId,
    archived: false,
    reason: "Teste Mestre de restauração",
  });
  const restoredObjective = await admin.from("objectives").select("archived_at").eq("id", ids.monthlyId).single();
  assert(restoredObjective.data?.archived_at === null, "7B3: objetivo não voltou do arquivo");

  const archivedArea = await ownerClient.from("areas").update({ archived_at: new Date().toISOString(), archived_by: state.users.ownerA.id })
    .eq("id", state.orgA.areas.commercial).eq("org_id", state.orgA.id).select("id").single();
  if (archivedArea.error) throw archivedArea.error;
  const restoredArea = await ownerClient.from("areas").update({ archived_at: null, archived_by: null })
    .eq("id", state.orgA.areas.commercial).eq("org_id", state.orgA.id).select("id").single();
  if (restoredArea.error) throw restoredArea.error;

  const roleRequestA = `master-role-a-${marker}`;
  const roleRequestB = `master-role-b-${marker}`;
  await callFunction("set-member-role", token, {
    orgId: state.orgA.id,
    membershipId: state.orgA.memberships.admin,
    role: "coordinator",
  }, roleRequestA);
  await callFunction("set-member-role", token, {
    orgId: state.orgA.id,
    membershipId: state.orgA.memberships.admin,
    role: "admin",
  }, roleRequestB);
  const audit = await admin.from("administrative_audit_events").select("id,action,request_id")
    .eq("org_id", state.orgA.id).in("request_id", [roleRequestA, roleRequestB]);
  if (audit.error) throw audit.error;
  assert(audit.data?.length === 2 && audit.data.every((item) => item.action === "member_role_changed"), "7B3: auditoria de papéis incompleta");

  const phoneSuffix = marker.replace(/\D/g, "").slice(-8);
  const phone = `+55467${phoneSuffix}`;
  const remoteJid = `${phone.slice(1)}@s.whatsapp.net`;
  const instanceName = `master-synthetic-${phoneSuffix}`;
  const webhookSecret = `master-${randomUUID()}`;
  const previousProfile = await admin.from("profiles").select("phone").eq("id", state.users.ownerA.id).single();
  if (previousProfile.error) throw previousProfile.error;
  try {
    const profile = await admin.from("profiles").update({ phone }).eq("id", state.users.ownerA.id);
    if (profile.error) throw profile.error;
    const settings = await admin.from("whatsapp_settings").upsert({
      org_id: state.orgA.id,
      instance_url: "http://127.0.0.1:9",
      instance_name: instanceName,
      connected_number: "+5546999990000",
      enabled: true,
      has_api_key: true,
      has_webhook_secret: true,
      inbound_queue_enabled: true,
      outbound_outbox_enabled: true,
    });
    if (settings.error) throw settings.error;
    const key = await admin.from("whatsapp_instance_keys").upsert({ org_id: state.orgA.id, api_key: `master-${randomUUID()}`, webhook_secret: webhookSecret });
    if (key.error) throw key.error;
    const worker = await admin.from("whatsapp_worker_secrets").select("worker_secret").eq("id", "worker").single();
    if (worker.error || !worker.data) throw worker.error ?? new Error("segredo do worker ausente");

    const webhook = await fetch(`${stagingUrl}/functions/v1/whatsapp-webhook?orgId=${state.orgA.id}`, {
      method: "POST",
      headers: { apikey: anonKey, "content-type": "application/json", "x-oraculo-webhook-secret": webhookSecret },
      body: JSON.stringify({
        event: "messages.upsert",
        instance: instanceName,
        data: {
          key: { id: `master-${randomUUID()}`, remoteJid, fromMe: false },
          message: { conversation: `Evidência no ${`Implantar rotina diária MASTER ${marker}`}: ritual realizado em 20 dias` },
        },
      }),
    });
    const webhookBody = await webhook.json() as Record<string, any>;
    assert(webhook.ok && webhookBody.queued === true, "7B3: webhook sintético não enfileirou");
    const workerResponse = await fetch(`${stagingUrl}/functions/v1/whatsapp-worker`, {
      method: "POST",
      headers: { apikey: anonKey, "content-type": "application/json", "x-oraculo-worker-secret": String(worker.data.worker_secret) },
      body: JSON.stringify({ orgId: state.orgA.id, batchSize: 1 }),
    });
    const workerBody = await workerResponse.json() as Record<string, any>;
    assert(workerResponse.ok && workerBody.completed === 1, "7B3: worker sintético não concluiu a mensagem");
    const evidence = await admin.from("evidences").select("id").eq("org_id", state.orgA.id).eq("objective_id", ids.monthlyId).ilike("text", "%ritual realizado em 20 dias%");
    if (evidence.error) throw evidence.error;
    assert((evidence.data?.length ?? 0) >= 1, "7B3: evidência explícita do WhatsApp não foi gravada");
  } finally {
    await admin.from("whatsapp_outbox").delete().eq("org_id", state.orgA.id);
    await admin.from("whatsapp_inbound_jobs").delete().eq("org_id", state.orgA.id);
    await admin.from("whatsapp_instance_keys").delete().eq("org_id", state.orgA.id);
    await admin.from("whatsapp_settings").delete().eq("org_id", state.orgA.id);
    await admin.from("profiles").update({ phone: previousProfile.data?.phone ?? null }).eq("id", state.users.ownerA.id);
  }

  report.blocks["7B3"] = {
    status: "passed",
    checks: [
      "revisão mensal com evidência e check-in",
      "importação confirmada de KPI e histórico",
      "vínculo objetivo-KPI atômico",
      "objetivo e área arquivados/restaurados",
      "mudança de papel auditada e revertida",
      "webhook, fila e worker sintéticos com evidência explícita",
    ],
  };
  await writeReport(report);
}

async function run7B4(state: BaselineState, token: string, report: FunctionalReport) {
  const backup = await callFunction("organization-backup", token, { action: "create", orgId: state.orgA.id });
  const backupId = String(backup.backup?.id ?? "");
  assert(/^[0-9a-f-]{36}$/.test(backupId), "7B4: backup não retornou ID válido");
  report.resources.backupId = backupId;

  const drill = await callFunction("organization-backup", token, {
    action: "drill",
    orgId: state.orgA.id,
    exerciseType: "monthly_drill",
  });
  const restoreRunId = String(drill.restoreRunId ?? "");
  const cloneOrgId = String(drill.targetOrgId ?? "");
  report.resources.restoreRunId = restoreRunId;
  report.resources.cloneOrgId = cloneOrgId;
  assert(drill.verification?.passed === true, "7B4: verificação do clone falhou");
  assert(drill.verification?.secretsExcluded === true, "7B4: clone não confirmou exclusão de segredos");
  assert(drill.verification?.whatsappDisabled === true, "7B4: WhatsApp do clone não ficou inerte");

  const admin = serviceClient();
  const cloneSecrets = await admin.from("whatsapp_instance_keys").select("org_id").eq("org_id", cloneOrgId);
  const cloneSettings = await admin.from("whatsapp_settings").select("enabled").eq("org_id", cloneOrgId);
  if (cloneSecrets.error || cloneSettings.error) throw cloneSecrets.error ?? cloneSettings.error;
  assert((cloneSecrets.data?.length ?? 0) === 0, "7B4: clone contém segredo de WhatsApp");
  assert((cloneSettings.data ?? []).every((item) => item.enabled === false), "7B4: configuração de WhatsApp do clone está ativa");

  await callFunction("organization-backup", token, {
    action: "discard_drill",
    orgId: state.orgA.id,
    restoreRunId,
  });
  const clone = await admin.from("organizations").select("id").eq("id", cloneOrgId).maybeSingle();
  if (clone.error) throw clone.error;
  assert(clone.data === null, "7B4: clone de teste não foi descartado");
  report.resources.cloneOrgId = undefined;

  report.blocks["7B4"] = {
    status: "passed",
    checks: [
      "backup completo criado",
      "clone interno restaurado e verificado",
      "segredos excluídos e WhatsApp inerte",
      "somente o clone de teste foi descartado",
    ],
  };
  await writeReport(report);
}

async function main() {
  assertStaging();
  required("SUPABASE_STAGING_SERVICE_ROLE_KEY");
  const state = await readBaseline();
  const existing = await readFile(REPORT_PATH, "utf8").then((value) => JSON.parse(value) as FunctionalReport).catch(() => null);
  if (existing?.completedAt) throw new Error(`7B já foi concluída em ${existing.completedAt}; preserve a evidência`);

  const report: FunctionalReport = existing ?? {
    version: 1,
    runId: state.runId,
    startedAt: new Date().toISOString(),
    stagingProjectRef: stagingProjectRef(),
    blocks: {
      "7B1": {
        status: "passed",
        checks: ["baseline 12/12: acesso, MFA, papéis, áreas, KPIs, isolamento e WhatsApp real inerte"],
      },
    },
    resources: { historicalDocumentIds: [], sessionIds: [], objectiveIds: [] },
  };
  if (report.runId !== state.runId) throw new Error("relatório 7B pertence a outro ciclo MASTER");
  await writeReport(report);

  const owner = await aal2Session(state);
  const ids = await run7B2(state, owner.token, report);
  await run7B3(state, owner.token, owner.client, report, ids);
  await run7B4(state, owner.token, report);
  report.completedAt = new Date().toISOString();
  await writeReport(report);

  console.log(JSON.stringify({
    ok: true,
    action: "functional",
    runId: report.runId,
    blocks: report.blocks,
    reportFile: REPORT_PATH,
    productionTouched: false,
    realWhatsappTouched: false,
  }, null, 2));
}

await main();
