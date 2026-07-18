import { resolveAiFunction } from "./ai-router.ts";
import { PERSONA_ORACULO, REGRAS_DE_SESSAO } from "./conductors/persona.ts";
import { loadOrgTone, toneDirective } from "./conductors/tone.ts";
import { MONTH_CLOSE_CONDUCTOR, MONTH_CLOSE_PHASES } from "./conductors/month-close.ts";
import { MONTHLY_CONDUCTOR, MONTHLY_PHASES } from "./conductors/monthly.ts";
import { validateMonthlyGuidanceEnvelope } from "./monthly-guidance.ts";
import { completeMonthlyReadyEnvelope, monthlyCapacityDecisionEnvelope, monthlyInheritedPendingEnvelope } from "./monthly-ready-block.ts";
import {
  conversationMessagesForModel,
  formatConversationMemory,
  getConversationById,
  getOrCreateConversation,
  insertConversationMessage,
  loadConversationHistory,
  maybeSummarize,
} from "./conversations.ts";
import { QUARTERLY_CONDUCTOR, QUARTERLY_PHASES } from "./conductors/quarterly.ts";
import { preserveExplicitQuarterlyCadence, validateQuarterlyGuidanceEnvelope } from "./quarterly-guidance.ts";
import { QUARTER_CLOSE_CONDUCTOR, QUARTER_CLOSE_PHASES } from "./conductors/quarter-close.ts";
import { STRATEGIC_REVIEW_CONDUCTOR, STRATEGIC_REVIEW_PHASES } from "./conductors/strategic-review.ts";
import { STRATEGIC_CONDUCTOR, STRATEGIC_PHASES } from "./conductors/strategic.ts";
import { parseJsonObject } from "./json.ts";
import { createTransientAiRetryBudget, withTransientAiRetry } from "./model.ts";
import { PLANNING_REQUEST_DEADLINE_MS, planningModelTimeout } from "./planning-timeout.ts";
import { callModelForFunction } from "./call-for-function.ts";
import { PLANNING_SESSION_OUTPUT } from "./session-output-schema.ts";
import { canonicalizePlanningEnvelopeScope } from "./session-canonical-envelope.ts";
import { monthClosePartialDecisionEnvelope, normalizeCloseQualityEnvelope, quarterCloseOpenDecisionEnvelope } from "./close-quality.ts";
import { buildPlanContext } from "./plan-context.ts";
import { documentTypeFromProposalType } from "./plan-documents.ts";
import { applyProposal } from "./proposals.ts";
import { nextMonthPeriod, nextQuarterPeriod } from "./periods.ts";
import { recordAiUsage } from "./usage.ts";
import { runIdempotentCommand } from "./tx-runner.ts";
import { proposalCommandKey } from "./tx-client.ts";
import {
  assertImportedQuarterlyReferences,
  assertSafeStructuredValue,
  formatUntrustedDocument,
  importedConversationReceipt,
  importedProposalFromModel,
  UNTRUSTED_CONTENT_RULES,
} from "./untrusted-content.ts";
import {
  asText,
  currentYearFromPeriod,
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
import {
  ADAPTIVE_SESSION_RULES,
  acknowledgeEquivalentQuarterlyArea,
  challengeQuarterlyPriorityOverload,
  buildAdaptiveRepairDirective,
  deferUnchallengedQuarterlyProposal,
  ensureAdaptiveStatePatch,
  latestOracleReply,
  normalizeReadyProposalEnvelope,
  normalizeProposalConfirmationEnvelope,
  normalizeStrategicHistoricalLessons,
  recoverAdaptiveEnvelopeAfterRepairFailure,
  resumeDeferredQuarterlyProposal,
  validateAdaptiveEnvelope,
} from "./session-adaptive.ts";

export {
  prepareReadyMonthlyPlanProposal,
  prepareReadyQuarterlyPlanProposal,
  prepareReadyStrategicPlanProposal,
} from "./session-imports.ts";

type Client = any;

export type PlanningSessionType = "strategic" | "quarterly" | "monthly" | "month_close" | "quarter_close" | "strategic_review";

const CONDUCTORS: Record<string, { phases: string[]; prompt: string; opening: string }> = {
  strategic: {
    phases: STRATEGIC_PHASES,
    prompt: STRATEGIC_CONDUCTOR,
    opening: "Vamos olhar o ano com foco no que realmente precisa mudar. Qual resultado faria a maior diferença para a empresa neste ciclo?",
  },
  quarterly: {
    phases: QUARTERLY_PHASES,
    prompt: QUARTERLY_CONDUCTOR,
    opening: "Neste trimestre, qual mudança na área faria mais diferença de verdade?",
  },
  monthly: {
    phases: MONTHLY_PHASES,
    prompt: MONTHLY_CONDUCTOR,
    opening: "No fim deste mês, o que precisa estar concretamente diferente na área?",
  },
  month_close: {
    phases: MONTH_CLOSE_PHASES,
    prompt: MONTH_CLOSE_CONDUCTOR,
    opening: "Vamos fechar o mês sem maquiar resultado. Qual objetivo melhor representa como o período terminou?",
  },
  quarter_close: {
    phases: QUARTER_CLOSE_PHASES,
    prompt: QUARTER_CLOSE_CONDUCTOR,
    opening: "Vamos fechar o trimestre olhando resultado, evidência e aprendizado. Qual objetivo melhor resume como o ciclo terminou?",
  },
  strategic_review: {
    phases: STRATEGIC_REVIEW_PHASES,
    prompt: STRATEGIC_REVIEW_CONDUCTOR,
    opening: "Vamos ajustar o plano anual sem recomeçar do zero. O que mudou no contexto e passou a exigir uma revisão agora?",
  },
};

function validNextPhase(type: string, nextPhase: unknown) {
  if (!nextPhase) return null;
  const text = String(nextPhase);
  return CONDUCTORS[type]?.phases.includes(text) ? text : null;
}

function conductorPrompt(type: string, phase: string) {
  const conductor = CONDUCTORS[type];
  return [
    `ROTEIRO ATIVO: ${type}`,
    `Fase atual: ${phase}`,
    `Fases na ordem: ${conductor.phases.join(", ")}`,
    conductor.prompt,
  ].join("\n\n");
}

function planFocusForSession(type: string) {
  if (type === "monthly" || type === "month_close") return "monthly" as const;
  if (type === "quarterly" || type === "quarter_close") return "quarterly" as const;
  return "org" as const;
}

async function ensureSessionConversation(client: Client, session: any, channel: "web" | "whatsapp") {
  if (session.conversation_id) {
    const existing = await getConversationById(client, session.conversation_id);
    if (existing) return { session, conversation: existing };
  }

  const conversation = await getOrCreateConversation(client, {
    orgId: session.org_id,
    userId: session.user_id,
    channel,
    areaId: session.area_id,
  });
  const { data: updated, error } = await client
    .from("planning_sessions")
    .update({ conversation_id: conversation.id })
    .eq("id", session.id)
    .select("*")
    .single();
  if (error) throw error;
  return { session: updated, conversation };
}

export async function startPlanningSession(
  client: Client,
  params: {
    orgId: string;
    areaId: string | null;
    type: PlanningSessionType;
    period: string;
    userId: string;
    channel?: "web" | "whatsapp";
    suppressOpeningMessage?: boolean;
  },
) {
  const conductor = CONDUCTORS[params.type];
  if (!conductor) throw new Error("Tipo de sessão ainda não disponível nesta fase");
  if (!["strategic", "strategic_review"].includes(params.type) && !params.areaId) {
    throw new Error("Selecione uma área antes de iniciar este planejamento");
  }
  const membership = await assertCanStartSession(client, params.orgId, params.areaId, params.userId);
  if (params.type === "strategic_review" && (params.areaId || membership.role !== "owner")) {
    throw new Error("Apenas owner pode iniciar uma Revisão Estratégica da empresa");
  }

  let existingQuery = client
    .from("planning_sessions")
    .select("*")
    .eq("org_id", params.orgId)
    .eq("user_id", params.userId)
    .eq("type", params.type)
    .eq("period", params.period)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);
  existingQuery = params.areaId ? existingQuery.eq("area_id", params.areaId) : existingQuery.is("area_id", null);
  const { data: existing, error: existingError } = await existingQuery.maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    const conversation = await getOrCreateConversation(client, {
      orgId: params.orgId,
      userId: params.userId,
      channel: params.channel ?? "web",
      areaId: params.areaId,
    });
    if (existing.conversation_id !== conversation.id) {
      const { data: rebound, error: rebindError } = await client
        .from("planning_sessions")
        .update({ conversation_id: conversation.id })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (rebindError) throw rebindError;
      const reply = "Retomei sua sessão em andamento. Pode continuar de onde paramos.";
      if ((params.channel ?? "web") === "whatsapp") await insertMessage(client, rebound, "oracle", reply, "whatsapp");
      return { session: rebound, reply };
    }
    const reply = "Retomei sua sessão em andamento. Pode continuar de onde paramos.";
    if ((params.channel ?? "web") === "whatsapp") await insertMessage(client, existing, "oracle", reply, "whatsapp");
    return { session: existing, reply };
  }

  const conversation = await getOrCreateConversation(client, {
    orgId: params.orgId,
    userId: params.userId,
    channel: params.channel ?? "web",
    areaId: params.areaId,
  });
  const { data: session, error } = await client
    .from("planning_sessions")
    .insert({
      org_id: params.orgId,
      area_id: params.areaId,
      user_id: params.userId,
      conversation_id: conversation.id,
      type: params.type,
      period: params.period,
      phase: conductor.phases[0],
      state: { periodo: params.period },
    })
    .select("*")
    .single();
  if (error) throw error;

  if (!params.suppressOpeningMessage) {
    await insertMessage(client, session, "oracle", conductor.opening, params.channel ?? "web");
  }
  return { session, reply: conductor.opening };
}

async function createFollowUpSessionAfterClose(
  client: Client,
  session: any,
  state: Record<string, unknown>,
  channel: "web" | "whatsapp",
) {
  if (session.type === "month_close" && state.abrir_planejamento_mensal === true) {
    const period = nextMonthPeriod(String(state.mes_fechado ?? session.period));
    return await startPlanningSession(client, {
      orgId: session.org_id,
      areaId: session.area_id,
      type: "monthly",
      period,
      userId: session.user_id,
      channel,
      suppressOpeningMessage: true,
    });
  }

  if (session.type === "quarter_close" && state.abrir_planejamento_trimestral === true) {
    const period = nextQuarterPeriod(String(state.trimestre_fechado ?? session.period));
    return await startPlanningSession(client, {
      orgId: session.org_id,
      areaId: session.area_id,
      type: "quarterly",
      period,
      userId: session.user_id,
      channel,
      suppressOpeningMessage: true,
    });
  }

  return null;
}

export async function processPlanningMessage(
  client: Client,
  params: { sessionId: string; message: string; userId: string; channel?: "web" | "whatsapp" },
) {
  const { data: session, error } = await client.from("planning_sessions").select("*").eq("id", params.sessionId).maybeSingle();
  if (error) throw error;
  if (!session) throw new Error("Sessão não encontrada");
  if (session.user_id !== params.userId) throw new Error("Sessão pertence a outro usuário");
  if (session.status !== "active") throw new Error("Sessão não está ativa");

  const channel = params.channel ?? "web";
  const ensured = await ensureSessionConversation(client, session, channel);
  await insertMessage(client, ensured.session, "user", params.message, channel);
  const conversation = await maybeSummarize(client, ensured.session.org_id, ensured.conversation);
  const [history, context, orgTone] = await Promise.all([
    loadConversationHistory(client, ensured.session.conversation_id),
    buildPlanContext(client, ensured.session.org_id, {
      areaId: ensured.session.area_id,
      focus: planFocusForSession(ensured.session.type),
      period: ensured.session.period,
    }),
    loadOrgTone(client, ensured.session.org_id),
  ]);
  const conversationMemory = formatConversationMemory(history);

  const systemPrompt = [
    PERSONA_ORACULO,
    REGRAS_DE_SESSAO,
    ADAPTIVE_SESSION_RULES,
    UNTRUSTED_CONTENT_RULES,
    toneDirective(orgTone),
    conductorPrompt(session.type, session.phase),
    "Estado já coletado:",
    JSON.stringify(session.state ?? {}, null, 2),
    conversationMemory,
    "Contexto atual do plano:",
    context,
  ].filter(Boolean).join("\n\n");

  const modelMessages = conversationMessagesForModel(history);
  const transientRetryBudget = createTransientAiRetryBudget(1);
  const planningRequestDeadline = Date.now() + PLANNING_REQUEST_DEADLINE_MS;
  let aiRoute: Awaited<ReturnType<typeof resolveAiFunction>> | null = null;
  const callPlanningModel = async (prompt: string, attempt: number, repairReasons: string[] = []) => {
    aiRoute ??= await resolveAiFunction(client, session.org_id, "planning");
    const route = aiRoute;
    if (!route) throw new Error("IA de planejamento não configurada");
    const output = await withTransientAiRetry(() => callModelForFunction(
      client,
      session.org_id,
      "planning",
      route,
      prompt,
      modelMessages,
      {
        ...route.limits,
        timeoutMs: planningModelTimeout(planningRequestDeadline),
        structuredOutput: PLANNING_SESSION_OUTPUT,
      },
      { userId: params.userId },
    ), transientRetryBudget);
    await recordAiUsage({
      client,
      orgId: session.org_id,
      provider: route.provider,
      model: route.model,
      channel: params.channel ?? "web",
      usage: output.usage,
      settings: route.legacySettings,
      metadata: {
        aiFunction: "planning",
        sessionId: session.id,
        sessionType: session.type,
        phase: session.phase,
        conversationId: conversation?.id ?? ensured.session.conversation_id,
        adaptiveAttempt: attempt,
        adaptiveRepairReasons: repairReasons,
      },
    });
    return output;
  };

  const parseEnvelope = (value: string) => {
    const envelope = parseJsonObject(value) as any;
    assertSafeStructuredValue(envelope);
    return envelope;
  };

  const previousOracleReply = latestOracleReply(history.messages);
  const conversationText = history.messages
    .map((message: any) => `${String(message.author ?? "")}: ${String(message.text ?? "")}`)
    .join("\n");
  const normalizeEnvelope = (envelope: any) => {
    let normalized = envelope;
    if (session.type === "monthly") {
      normalized = normalizeProposalConfirmationEnvelope(normalized, session.type);
    }
    if (session.type === "month_close" || session.type === "quarter_close") {
      normalized = normalizeCloseQualityEnvelope({
        envelope: normalized,
        sessionType: session.type,
        period: session.period,
        conversationText,
        contextText: context,
      });
    }
    if (session.type === "strategic") {
      normalized = normalized?.proposal?.type === "save_strategic_plan"
        ? {
          ...normalized,
          proposal: normalizeReadyStrategicProposal(normalized.proposal, session.period, { fillMissingLabels: false }),
        }
        : normalized;
      normalized = normalizeStrategicHistoricalLessons(normalized, conversationText);
    }
    if (session.type === "quarterly") {
      const priorityEnvelope = challengeQuarterlyPriorityOverload({
        envelope: normalized,
        sessionType: session.type,
        currentPhase: session.phase,
        sessionState: session.state,
        userMessage: params.message,
        planContext: context,
      });
      const scopedEnvelope = acknowledgeEquivalentQuarterlyArea({
        envelope: priorityEnvelope,
        sessionType: session.type,
        userMessage: params.message,
        planContext: context,
      });
      const normalizedEnvelope = normalizeProposalConfirmationEnvelope(
        preserveExplicitQuarterlyCadence(scopedEnvelope, conversationText),
        session.type,
        { userMessage: params.message, previousOracleReply },
      );
      normalized = deferUnchallengedQuarterlyProposal({
        envelope: normalizedEnvelope,
        sessionType: session.type,
        currentPhase: session.phase,
        sessionState: session.state,
        conversationText,
        userMessage: params.message,
      });
    }
    normalized = canonicalizePlanningEnvelopeScope({
      envelope: normalized,
      sessionType: session.type,
      sessionPeriod: session.period,
    });
    if (["strategic", "quarterly", "monthly"].includes(session.type) && normalized?.proposal) {
      normalized = normalizeProposalConfirmationEnvelope(
        normalized,
        session.type,
        { userMessage: params.message, previousOracleReply },
      );
    }
    return {
      ...normalized,
      state_patch: ensureAdaptiveStatePatch(
        normalized?.state_patch,
        params.message,
        Boolean(normalized?.proposal),
        false,
        session.state,
      ),
    };
  };
  const validateEnvelope = (envelope: any) => [
    ...validateAdaptiveEnvelope({
      envelope,
      sessionType: session.type,
      sessionPeriod: session.period,
      currentPhase: session.phase,
      phases: CONDUCTORS[session.type].phases,
      sessionState: session.state,
      conversationText,
      previousOracleReply,
      userMessage: params.message,
    }),
    ...(session.type === "quarterly" ? validateQuarterlyGuidanceEnvelope({ envelope }) : []),
    ...(session.type === "monthly"
      ? validateMonthlyGuidanceEnvelope({ envelope, sessionPeriod: session.period, userMessage: params.message })
      : []),
  ].filter((reason, index, values) => values.indexOf(reason) === index);
  const recoverEnvelope = (envelope: any, reasons: string[]) => recoverAdaptiveEnvelopeAfterRepairFailure({
    envelope,
    reasons,
    sessionType: session.type,
    currentPhase: session.phase,
    phases: CONDUCTORS[session.type].phases,
    userMessage: params.message,
    sessionState: session.state,
  });
  const deterministicPlanningEnvelope = resumeDeferredQuarterlyProposal({
    sessionType: session.type,
    sessionState: session.state,
    conversationText,
    userMessage: params.message,
    currentPhase: session.phase,
    phases: CONDUCTORS[session.type].phases,
  })
    ?? await monthlyInheritedPendingEnvelope(client, ensured.session, params.message)
    ?? await completeMonthlyReadyEnvelope(client, ensured.session, params.message)
    ?? monthlyCapacityDecisionEnvelope(ensured.session, params.message, context)
    ?? monthClosePartialDecisionEnvelope(ensured.session, params.message, conversationText)
    ?? quarterCloseOpenDecisionEnvelope(ensured.session, params.message, conversationText, context);
  let result: { text: string; [key: string]: unknown } = { text: "" };
  let parsed: any = null;
  let repairReasons: string[] = [];
  if (deterministicPlanningEnvelope) {
    parsed = normalizeEnvelope(deterministicPlanningEnvelope);
    repairReasons = validateEnvelope(parsed);
  }
  if (!deterministicPlanningEnvelope || repairReasons.length) {
    result = await callPlanningModel(systemPrompt, 1);
    try {
      parsed = normalizeEnvelope(parseEnvelope(result.text));
      repairReasons = validateEnvelope(parsed);
    } catch {
      repairReasons = ["invalid_json_envelope"];
    }
  }

  const normalizedReadyProposal = normalizeReadyProposalEnvelope({
    envelope: parsed ?? {},
    reasons: repairReasons,
    sessionType: session.type,
    currentPhase: session.phase,
    phases: CONDUCTORS[session.type].phases,
    userMessage: params.message,
    sessionState: session.state,
  });
  if (normalizedReadyProposal) {
    parsed = normalizedReadyProposal;
    repairReasons = validateEnvelope(parsed);
  }

  if (repairReasons.length) {
    const rejectedEnvelope = parsed;
    const repairPrompt = [systemPrompt, buildAdaptiveRepairDirective(repairReasons, parsed?.reply ?? result.text)].join("\n\n");
    result = await callPlanningModel(repairPrompt, 2, repairReasons);
    try {
      parsed = normalizeEnvelope(parseEnvelope(result.text));
    } catch {
      parsed = recoverEnvelope(rejectedEnvelope, repairReasons);
    }
    const remainingReasons = validateEnvelope(parsed);
    if (remainingReasons.length) {
      parsed = recoverEnvelope(parsed, remainingReasons);
    }
  }

  const reply = typeof parsed?.reply === "string" ? parsed.reply : result.text;
  const statePatch = parsed?.state_patch && typeof parsed.state_patch === "object"
    ? ensureAdaptiveStatePatch(parsed.state_patch, params.message, Boolean(parsed?.proposal), false, session.state)
    : ensureAdaptiveStatePatch({}, params.message, Boolean(parsed?.proposal), false, session.state);
  const nextPhase = validNextPhase(session.type, parsed?.next_phase) ?? session.phase;
  const expectedProposalTypes: Partial<Record<PlanningSessionType, "save_strategic_plan" | "save_quarterly_plan" | "save_monthly_plan">> = {
    strategic: "save_strategic_plan",
    quarterly: "save_quarterly_plan",
    monthly: "save_monthly_plan",
  };
  const expectedProposalType = expectedProposalTypes[session.type as PlanningSessionType];
  const pendingProposal = parsed?.proposal && expectedProposalType
    ? importedProposalFromModel({ proposal: parsed.proposal }, expectedProposalType)
    : parsed?.proposal ?? null;
  const nextState = shallowMergeState(session.state ?? {}, statePatch);
  const completed = parsed?.done === true && !pendingProposal;

  const { data: updated, error: updateError } = await client
    .from("planning_sessions")
    .update({
      phase: nextPhase,
      state: nextState,
      pending_proposal: pendingProposal,
      status: completed ? "completed" : "active",
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", ensured.session.id)
    .select("*")
    .single();
  if (updateError) throw updateError;

  const followUp = completed ? await createFollowUpSessionAfterClose(client, updated, nextState, channel) : null;
  const finalReply = followUp
    ? `${reply}\n\nAbri o próximo ciclo para você.\n\n${followUp.reply}`
    : reply;

  await insertMessage(client, followUp?.session ?? updated, "oracle", finalReply, params.channel ?? "web");
  return { session: followUp?.session ?? updated, reply: finalReply, pendingProposal };
}

async function loadLatestDocumentForProposal(client: Client, session: any, proposal: any) {
  const documentType = documentTypeFromProposalType(asText(proposal?.type));
  if (!documentType) return null;
  const period = documentType === "strategic"
    ? String(proposal?.year ?? currentYearFromPeriod(session.period))
    : asText(proposal?.period ?? proposal?.periodo, session.period);

  let query = client
    .from("plan_documents")
    .select("*")
    .eq("org_id", session.org_id)
    .eq("type", documentType)
    .eq("period", period)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  query = session.area_id ? query.eq("area_id", session.area_id) : query.is("area_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

export async function confirmPlanningProposal(client: Client, params: { sessionId: string; userId: string; channel?: "web" | "whatsapp"; confirmationText?: string | null }) {
  const { data: session, error } = await client.from("planning_sessions").select("*").eq("id", params.sessionId).maybeSingle();
  if (error) throw error;
  if (!session) throw new Error("Sessão não encontrada");
  if (session.user_id !== params.userId) throw new Error("Sessão pertence a outro usuário");
  if (!session.pending_proposal) throw new Error("Não há proposta pendente para confirmar");

  const channel = params.channel ?? "web";
  const ensured = await ensureSessionConversation(client, session, channel);
  if (params.confirmationText) {
    await insertMessage(client, ensured.session, "user", params.confirmationText, channel);
  }

  const proposal = ensured.session.pending_proposal;
  const operation = String(proposal?.type ?? "");
  const isCloseSession = ensured.session.type === "month_close" || ensured.session.type === "quarter_close";
  const nextPhase = ensured.session.type === "month_close" ? "ponte" : ensured.session.type === "quarter_close" ? "balanco" : ensured.session.phase;
  const isReviewSession = ensured.session.type === "strategic_review";

  // Chave idempotente por sessao + tipo + conteudo da proposta. Confirmar a mesma
  // proposta de novo (duplo clique, reenvio no WhatsApp, retry) devolve o mesmo
  // resultado sem duplicar; um erro no meio reverte tudo (nada parcial fica salvo).
  const key = await proposalCommandKey(ensured.session.id, operation, proposal, params.userId);
  key.orgId = ensured.session.org_id;

  // Tudo o que muda dados criticos roda DENTRO da transacao (grava plano + documento
  // e limpa pending_proposal atomicamente). O log de mensagens fica fora (cosmetico).
  const outcome = await runIdempotentCommand(key, async (tx) => {
    const summary = await applyProposal(tx, ensured.session, proposal, params.userId);
    const document = channel === "whatsapp" ? await loadLatestDocumentForProposal(tx, ensured.session, proposal) : null;
    const reply = isCloseSession
      ? `${summary}\n\nFechamento salvo. Quer já abrir o próximo ciclo agora?`
      : isReviewSession
        ? `${summary} Revisão salva no sistema.`
      : `${summary} O plano já está salvo no sistema.`;
    const { error: updateError } = await tx
      .from("planning_sessions")
      .update({
        pending_proposal: null,
        phase: nextPhase,
        status: isCloseSession ? "active" : "completed",
        completed_at: isCloseSession ? null : new Date().toISOString(),
      })
      .eq("id", ensured.session.id)
      .select("*")
      .single();
    if (updateError) throw updateError;
    return { result: { summary, reply, documentId: document?.id ?? null } };
  });

  const reply = String(outcome.result.reply ?? "");
  // Recarrega SEMPRE o estado atual da sessao do banco (paridade exata com a 1A),
  // inclusive em confirmacao repetida: nunca devolve um snapshot congelado. Importa
  // para sessoes de fechamento (month_close/quarter_close) que seguem 'active' e
  // continuam sendo mutadas apos a confirmacao. Erro no reload propaga (mesma politica
  // do load inicial) para nunca cair num snapshot pre-transacao com pending_proposal setado.
  const { data: reloaded, error: reloadError } = await client.from("planning_sessions").select("*").eq("id", ensured.session.id).maybeSingle();
  if (reloadError) throw reloadError;
  const finalSession = reloaded ?? ensured.session;

  // Log da resposta do Oraculo — cosmetico, fora da transacao: nunca reverte um plano ja salvo.
  try {
    await insertMessage(client, finalSession, "oracle", reply, channel);
  } catch (_) { /* log nao-critico */ }

  let document = null;
  if (channel === "whatsapp" && outcome.result.documentId) {
    const { data, error: documentError } = await client
      .from("plan_documents")
      .select("*")
      .eq("id", String(outcome.result.documentId))
      .maybeSingle();
    if (documentError) throw documentError;
    document = data;
  }

  return { session: finalSession, reply, document };
}

export async function abandonPlanningSession(client: Client, params: { sessionId: string; userId: string }) {
  const { data: session, error } = await client
    .from("planning_sessions")
    .update({ status: "abandoned" })
    .eq("id", params.sessionId)
    .eq("user_id", params.userId)
    .select("*")
    .single();
  if (error) throw error;
  return { session, reply: "Sessão pausada. Quando quiser, você pode iniciar uma nova condução." };
}
