import { resolveAiFunction } from "./ai-router.ts";
import { getOrCreateConversation } from "./conversations.ts";
import { loadOrgTone, toneDirective } from "./conductors/tone.ts";
import { parseJsonObject } from "./json.ts";
import { callModelForFunction } from "./call-for-function.ts";
import { buildPlanContext } from "./plan-context.ts";
import { recordAiUsage } from "./usage.ts";
import {
  assertImportedQuarterlyReferences,
  formatUntrustedDocument,
  importedConversationReceipt,
  importedProposalFromModel,
} from "./untrusted-content.ts";
import {
  formatReadyMonthlyPlanReply,
  formatReadyQuarterlyPlanReply,
  formatReadyStrategicPlanReply,
  normalizeReadyMonthlyProposal,
  normalizeReadyQuarterlyProposal,
  normalizeReadyStrategicProposal,
  readyMonthlyPlanSystemPrompt,
  readyPlanSystemPrompt,
  readyQuarterlyPlanSystemPrompt,
} from "./session-ready-plans.ts";
import { assertCanStartSession, insertSessionMessage as insertMessage, shallowMergeState } from "./session-runtime.ts";

type Client = any;

export async function prepareReadyStrategicPlanProposal(
  client: Client,
  params: {
    orgId: string;
    areaId?: string | null;
    period: string;
    planText: string;
    fileName?: string | null;
    userId: string;
    channel?: "web" | "whatsapp";
  },
) {
  const channel = params.channel ?? "web";
  const planText = params.planText.trim();
  if (!planText) throw new Error("Texto do plano pronto não informado");

  await assertCanStartSession(client, params.orgId, params.areaId ?? null, params.userId);
  const aiRoute = await resolveAiFunction(client, params.orgId, "planning");
  if (!aiRoute) throw new Error("IA de planejamento não configurada");

  const conversation = await getOrCreateConversation(client, {
    orgId: params.orgId,
    userId: params.userId,
    channel,
    areaId: params.areaId ?? null,
  });
  const { data: existing, error: existingError } = await client
    .from("planning_sessions")
    .select("*")
    .eq("org_id", params.orgId)
    .eq("user_id", params.userId)
    .eq("type", "strategic")
    .eq("period", params.period)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  let session = existing;
  if (!session) {
    const { data, error } = await client
      .from("planning_sessions")
      .insert({
        org_id: params.orgId,
        area_id: params.areaId ?? null,
        user_id: params.userId,
        conversation_id: conversation.id,
        type: "strategic",
        period: params.period,
        phase: "sintese",
        state: { periodo: params.period, importacao_plano_pronto: true, arquivo: params.fileName ? "arquivo importado" : null },
      })
      .select("*")
      .single();
    if (error) throw error;
    session = data;
  }

  const [context, orgTone] = await Promise.all([
    buildPlanContext(client, params.orgId, { areaId: params.areaId ?? null, focus: "org" }),
    loadOrgTone(client, params.orgId),
  ]);
  const userMessage = [
    "Importar plano estratégico pronto para o Oráculo.",
    `Ano/período confiável definido pelo sistema: ${params.period}`,
    formatUntrustedDocument({ content: planText, fileName: params.fileName }),
  ].filter(Boolean).join("\n\n");

  await insertMessage(client, session, "user", importedConversationReceipt(params.fileName, "Plano estratégico"), channel);

  const result = await callModelForFunction(
    client,
    params.orgId,
    "planning",
    aiRoute,
    readyPlanSystemPrompt(context, params.period, channel, toneDirective(orgTone)),
    [{ role: "user", content: userMessage }],
    aiRoute.limits,
    { userId: params.userId },
  );

  await recordAiUsage({
    client,
    orgId: params.orgId,
    provider: aiRoute.provider,
    model: aiRoute.model,
    channel,
    usage: result.usage,
    settings: aiRoute.legacySettings,
    metadata: { aiFunction: "planning", sessionId: session.id, sessionType: "strategic", phase: "sintese", action: "ready_plan_import" },
  });

  const parsed = parseJsonObject(result.text) as any;
  const rawProposal = importedProposalFromModel(parsed, "save_strategic_plan");
  const proposal = normalizeReadyStrategicProposal(rawProposal, params.period);
  if (!proposal.objectives.length) {
    throw new Error("O Oráculo não conseguiu identificar objetivos estratégicos no plano importado");
  }

  const reply = formatReadyStrategicPlanReply(proposal, channel);
  const nextState = shallowMergeState(session.state ?? {}, {
    importacao_plano_pronto: true,
    arquivo: params.fileName ? "arquivo importado" : null,
  });

  const { data: updated, error: updateError } = await client
    .from("planning_sessions")
    .update({
      phase: "sintese",
      state: nextState,
      pending_proposal: proposal,
      status: "active",
      completed_at: null,
      conversation_id: session.conversation_id ?? conversation.id,
    })
    .eq("id", session.id)
    .select("*")
    .single();
  if (updateError) throw updateError;

  await insertMessage(client, updated, "oracle", reply, channel);
  return { session: updated, reply, pendingProposal: proposal };
}

export async function prepareReadyQuarterlyPlanProposal(
  client: Client,
  params: {
    orgId: string;
    areaId: string;
    period: string;
    planText: string;
    fileName?: string | null;
    userId: string;
    channel?: "web" | "whatsapp";
  },
) {
  const channel = params.channel ?? "web";
  const planText = params.planText.trim();
  if (!params.areaId) throw new Error("Plano trimestral exige um departamento selecionado");
  if (!planText) throw new Error("Texto do plano trimestral pronto não informado");

  await assertCanStartSession(client, params.orgId, params.areaId, params.userId);
  const aiRoute = await resolveAiFunction(client, params.orgId, "planning");
  if (!aiRoute) throw new Error("IA de planejamento não configurada");

  const conversation = await getOrCreateConversation(client, {
    orgId: params.orgId,
    userId: params.userId,
    channel,
    areaId: params.areaId,
  });
  const { data: existing, error: existingError } = await client
    .from("planning_sessions")
    .select("*")
    .eq("org_id", params.orgId)
    .eq("area_id", params.areaId)
    .eq("user_id", params.userId)
    .eq("type", "quarterly")
    .eq("period", params.period)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  let session = existing;
  if (!session) {
    const { data, error } = await client
      .from("planning_sessions")
      .insert({
        org_id: params.orgId,
        area_id: params.areaId,
        user_id: params.userId,
        conversation_id: conversation.id,
        type: "quarterly",
        period: params.period,
        phase: "sintese",
        state: { periodo: params.period, importacao_plano_trimestral_pronto: true, arquivo: params.fileName ? "arquivo importado" : null },
      })
      .select("*")
      .single();
    if (error) throw error;
    session = data;
  }

  const [context, orgTone] = await Promise.all([
    buildPlanContext(client, params.orgId, { areaId: params.areaId, focus: "quarterly", period: params.period }),
    loadOrgTone(client, params.orgId),
  ]);
  const userMessage = [
    "Importar plano trimestral pronto para o Oráculo.",
    `Período confiável definido pelo sistema: ${params.period}`,
    formatUntrustedDocument({ content: planText, fileName: params.fileName }),
  ].filter(Boolean).join("\n\n");

  await insertMessage(client, session, "user", importedConversationReceipt(params.fileName, "Plano trimestral"), channel);

  const result = await callModelForFunction(
    client,
    params.orgId,
    "planning",
    aiRoute,
    readyQuarterlyPlanSystemPrompt(context, params.period, channel, toneDirective(orgTone)),
    [{ role: "user", content: userMessage }],
    aiRoute.limits,
    { userId: params.userId },
  );

  await recordAiUsage({
    client,
    orgId: params.orgId,
    provider: aiRoute.provider,
    model: aiRoute.model,
    channel,
    usage: result.usage,
    settings: aiRoute.legacySettings,
    metadata: { aiFunction: "planning", sessionId: session.id, sessionType: "quarterly", phase: "sintese", action: "ready_quarterly_plan_import" },
  });

  const parsed = parseJsonObject(result.text) as any;
  const rawProposal = importedProposalFromModel(parsed, "save_quarterly_plan");
  const proposal = normalizeReadyQuarterlyProposal(rawProposal, params.period);
  await assertImportedQuarterlyReferences(client, params.orgId, proposal);
  if (!proposal.quarterlyObjectives.length) {
    throw new Error("O Oráculo não conseguiu identificar objetivos trimestrais no plano importado");
  }

  const reply = formatReadyQuarterlyPlanReply(proposal, channel);
  const nextState = shallowMergeState(session.state ?? {}, {
    importacao_plano_trimestral_pronto: true,
    arquivo: params.fileName ? "arquivo importado" : null,
  });

  const { data: updated, error: updateError } = await client
    .from("planning_sessions")
    .update({
      phase: "sintese",
      state: nextState,
      pending_proposal: proposal,
      status: "active",
      completed_at: null,
      conversation_id: session.conversation_id ?? conversation.id,
    })
    .eq("id", session.id)
    .select("*")
    .single();
  if (updateError) throw updateError;

  await insertMessage(client, updated, "oracle", reply, channel);
  return { session: updated, reply, pendingProposal: proposal };
}

export async function prepareReadyMonthlyPlanProposal(
  client: Client,
  params: {
    orgId: string;
    areaId: string;
    period: string;
    planText: string;
    fileName?: string | null;
    userId: string;
    channel?: "web" | "whatsapp";
  },
) {
  const channel = params.channel ?? "web";
  const planText = params.planText.trim();
  if (!params.areaId) throw new Error("Plano mensal exige um departamento selecionado");
  if (!planText) throw new Error("Texto do plano mensal pronto não informado");

  await assertCanStartSession(client, params.orgId, params.areaId, params.userId);
  const aiRoute = await resolveAiFunction(client, params.orgId, "planning");
  if (!aiRoute) throw new Error("IA de planejamento não configurada");

  const conversation = await getOrCreateConversation(client, {
    orgId: params.orgId,
    userId: params.userId,
    channel,
    areaId: params.areaId,
  });
  const { data: existing, error: existingError } = await client
    .from("planning_sessions")
    .select("*")
    .eq("org_id", params.orgId)
    .eq("area_id", params.areaId)
    .eq("user_id", params.userId)
    .eq("type", "monthly")
    .eq("period", params.period)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  let session = existing;
  if (!session) {
    const { data, error } = await client
      .from("planning_sessions")
      .insert({
        org_id: params.orgId,
        area_id: params.areaId,
        user_id: params.userId,
        conversation_id: conversation.id,
        type: "monthly",
        period: params.period,
        phase: "sintese",
        state: { periodo: params.period, importacao_plano_mensal_pronto: true, arquivo: params.fileName ? "arquivo importado" : null },
      })
      .select("*")
      .single();
    if (error) throw error;
    session = data;
  }

  const [context, orgTone] = await Promise.all([
    buildPlanContext(client, params.orgId, { areaId: params.areaId, focus: "monthly", period: params.period }),
    loadOrgTone(client, params.orgId),
  ]);
  const userMessage = [
    "Importar plano mensal pronto para o Oráculo.",
    `Período confiável definido pelo sistema: ${params.period}`,
    formatUntrustedDocument({ content: planText, fileName: params.fileName }),
  ].filter(Boolean).join("\n\n");

  await insertMessage(client, session, "user", importedConversationReceipt(params.fileName, "Plano mensal"), channel);

  const result = await callModelForFunction(
    client,
    params.orgId,
    "planning",
    aiRoute,
    readyMonthlyPlanSystemPrompt(context, params.period, channel, toneDirective(orgTone)),
    [{ role: "user", content: userMessage }],
    aiRoute.limits,
    { userId: params.userId },
  );

  await recordAiUsage({
    client,
    orgId: params.orgId,
    provider: aiRoute.provider,
    model: aiRoute.model,
    channel,
    usage: result.usage,
    settings: aiRoute.legacySettings,
    metadata: { aiFunction: "planning", sessionId: session.id, sessionType: "monthly", phase: "sintese", action: "ready_monthly_plan_import" },
  });

  const parsed = parseJsonObject(result.text) as any;
  const rawProposal = importedProposalFromModel(parsed, "save_monthly_plan");
  const proposal = normalizeReadyMonthlyProposal(rawProposal, params.period);
  if (!proposal.objectives.length) {
    throw new Error("O Oráculo não conseguiu identificar objetivos mensais no plano importado");
  }

  const reply = formatReadyMonthlyPlanReply(proposal, channel);
  const nextState = shallowMergeState(session.state ?? {}, {
    importacao_plano_mensal_pronto: true,
    arquivo: params.fileName ? "arquivo importado" : null,
  });

  const { data: updated, error: updateError } = await client
    .from("planning_sessions")
    .update({
      phase: "sintese",
      state: nextState,
      pending_proposal: proposal,
      status: "active",
      completed_at: null,
      conversation_id: session.conversation_id ?? conversation.id,
    })
    .eq("id", session.id)
    .select("*")
    .single();
  if (updateError) throw updateError;

  await insertMessage(client, updated, "oracle", reply, channel);
  return { session: updated, reply, pendingProposal: proposal };
}

