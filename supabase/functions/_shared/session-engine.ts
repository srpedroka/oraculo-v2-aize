import { resolveAiFunction } from "./ai-router.ts";
import { CONTRATO_TECNICO, NUCLEO_ORACULO } from "./conductors/nucleo.ts";
import { PERSONA_ORACULO } from "./conductors/persona.ts";
import { loadOrgTone, toneDirective } from "./conductors/tone.ts";
import { MONTH_CLOSE_CONDUCTOR, MONTH_CLOSE_PHASES } from "./conductors/month-close.ts";
import { MONTHLY_CONDUCTOR, MONTHLY_PHASES } from "./conductors/monthly.ts";
import { validateMonthlyGuidanceEnvelope } from "./monthly-guidance.ts";
import {
  completeMonthlyReadySituation,
  monthlyCapacityDecisionSituation,
  monthlyExperiencedActionsChallengeSituation,
  monthlyInheritedPendingSituation,
} from "./monthly-ready-block.ts";
import {
  conversationMessagesForModel,
  formatConversationMemory,
  getConversationById,
  getOrCreateConversation,
  insertConversationMessage,
  loadConversationHistory,
  maybeSummarize,
} from "./conversations.ts";
import { shouldRebindSessionConversation } from "./conversation-policy.ts";
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
import {
  claimPlanningSessionTurn,
  extractionFailureReply,
  extractionUsageMetadata,
  loadProseSplitEnabled,
  parsePlanningSessionStructure,
  PLANNING_SESSION_STRUCTURE_OUTPUT,
  planningProseText,
  PROSE_ONLY_CONTRACT,
  releasePlanningSessionTurn,
  SESSION_EXTRACTION_PROMPT,
  sessionExtractionMessage,
} from "./session-extract.ts";
import { canonicalizePlanningEnvelopeScope } from "./session-canonical-envelope.ts";
import { replayedSessionConfirmation } from "./session-confirmation.ts";
import {
  monthClosePartialDecisionSituation,
  normalizeCloseQualityEnvelope,
  quarterCloseOpenDecisionSituation,
} from "./close-quality.ts";
import {
  applyPlanningSituation,
  planningSituationFromEnvelope,
  planningSituationPrompt,
  type PlanningSituation,
} from "./planning-situation.ts";
import { buildPlanContext } from "./plan-context.ts";
import { sessionAsideDirective, sessionAsideKind } from "./session-conversation.ts";
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
  acknowledgeEquivalentQuarterlyArea,
  buildAdaptiveStyleObservationMetadata,
  challengeQuarterlyPriorityOverload,
  buildAdaptiveRepairDirective,
  deferUnchallengedQuarterlyProposal,
  ensureAdaptiveStatePatch,
  latestOracleReply,
  normalizeReadyProposalEnvelope,
  normalizeProposalConfirmationEnvelope,
  normalizeStrategicHistoricalLessons,
  partitionAdaptiveValidationReasons,
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

type ProcessPlanningMessageParams = {
  sessionId: string;
  message: string;
  userId: string;
  channel?: "web" | "whatsapp";
  skipUserMessageInsert?: boolean;
  transientContext?: string | null;
};

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
    opening: "Vamos revisar o plano anual sem recomeçar do zero, no meio ou no fim do ano. O que mudou no contexto e precisa orientar esta revisão?",
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
  if (type === "strategic_review") return "semester_review" as const;
  if (type === "monthly" || type === "month_close") return "monthly" as const;
  if (type === "quarterly" || type === "quarter_close") return "quarterly" as const;
  return "org" as const;
}

async function ensureSessionConversation(client: Client, session: any, channel: "web" | "whatsapp") {
  if (session.conversation_id) {
    const existing = await getConversationById(client, session.conversation_id);
    if (!shouldRebindSessionConversation(existing, {
      orgId: session.org_id,
      userId: session.user_id,
      channel,
    })) return { session, conversation: existing };
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
      if (!params.suppressOpeningMessage && (params.channel ?? "web") === "whatsapp") await insertMessage(client, rebound, "oracle", reply, "whatsapp");
      return { session: rebound, reply };
    }
    const reply = "Retomei sua sessão em andamento. Pode continuar de onde paramos.";
    if (!params.suppressOpeningMessage && (params.channel ?? "web") === "whatsapp") await insertMessage(client, existing, "oracle", reply, "whatsapp");
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
  params: ProcessPlanningMessageParams,
) {
  const { data: session, error } = await client.from("planning_sessions").select("*").eq("id", params.sessionId).maybeSingle();
  if (error) throw error;
  if (!session) throw new Error("Sessão não encontrada");
  if (session.user_id !== params.userId) throw new Error("Sessão pertence a outro usuário");
  if (session.status !== "active") throw new Error("Sessão não está ativa");

  const proseSplitEnabled = await loadProseSplitEnabled(client, session.org_id);
  if (!proseSplitEnabled) {
    return processPlanningMessageCore(client, params, session, false, null);
  }

  const turnToken = crypto.randomUUID();
  const claimedSession = await claimPlanningSessionTurn(client, {
    sessionId: session.id,
    userId: params.userId,
    token: turnToken,
  });
  if (!claimedSession) {
    throw Object.assign(
      new Error("Ainda estou processando a mensagem anterior. Tente novamente em alguns instantes."),
      { code: "SESSION_TURN_BUSY" },
    );
  }

  try {
    return await processPlanningMessageCore(client, params, claimedSession, true, turnToken);
  } finally {
    try {
      await releasePlanningSessionTurn(client, { sessionId: session.id, token: turnToken });
    } catch (releaseError) {
      console.error("Erro ao liberar turno da sessão", releaseError instanceof Error ? releaseError.message : "unknown");
    }
  }
}

async function processPlanningMessageCore(
  client: Client,
  params: ProcessPlanningMessageParams,
  session: any,
  proseSplitEnabled: boolean,
  turnToken: string | null,
) {

  const channel = params.channel ?? "web";
  const ensured = await ensureSessionConversation(client, session, channel);
  if (!params.skipUserMessageInsert) {
    await insertMessage(client, ensured.session, "user", params.message, channel);
  }
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
  const groundedTurnInput = params.transientContext
    ? `${params.message}\n\n${params.transientContext}`
    : params.message;

  const asideKind = sessionAsideKind(params.message);
  if (asideKind) {
    const aiRoute = await resolveAiFunction(client, ensured.session.org_id, "planning");
    if (!aiRoute) throw new Error("IA de planejamento não configurada");
    const asidePrompt = [
      PERSONA_ORACULO,
      toneDirective(orgTone),
      sessionAsideDirective(asideKind),
      conversationMemory,
      "Contexto atual do plano:",
      context,
    ].filter(Boolean).join("\n\n");
    const output = await callModelForFunction(
      client,
      ensured.session.org_id,
      "planning",
      aiRoute,
      asidePrompt,
      conversationMessagesForModel(history),
      { ...aiRoute.limits, timeoutMs: planningModelTimeout(Date.now() + PLANNING_REQUEST_DEADLINE_MS) },
      { userId: params.userId },
    );
    await recordAiUsage({
      client,
      orgId: ensured.session.org_id,
      provider: aiRoute.provider,
      model: aiRoute.model,
      channel,
      usage: output.usage,
      settings: aiRoute.legacySettings,
      metadata: {
        aiFunction: "planning",
        action: "session_conversation_aside",
        asideKind,
        sessionId: ensured.session.id,
        sessionType: ensured.session.type,
        conversationId: conversation?.id ?? ensured.session.conversation_id,
      },
    });
    const reply = String(output.text ?? "").trim()
      || "Pode mandar o arquivo. Vou ler o conteúdo e depois retomamos exatamente deste ponto.";
    await insertMessage(client, ensured.session, "oracle", reply, channel);
    return { session: ensured.session, reply, pendingProposal: ensured.session.pending_proposal ?? null };
  }

  const previousOracleReply = latestOracleReply(history.messages);
  const conversationText = history.messages
    .map((message: any) => `${String(message.author ?? "")}: ${String(message.text ?? "")}`)
    .join("\n");
  const resumedDeferredProposal = resumeDeferredQuarterlyProposal({
    sessionType: session.type,
    sessionState: session.state,
    conversationText,
    userMessage: groundedTurnInput,
    currentPhase: session.phase,
    phases: CONDUCTORS[session.type].phases,
  });
  let detectedSituation: PlanningSituation | null = resumedDeferredProposal
    ? planningSituationFromEnvelope(
      "quarterly_deferred_proposal_ready",
      { period: session.period, proposalType: "save_quarterly_plan" },
      "Apresentar a proposta trimestral consolidada e pedir uma unica confirmacao para gravar.",
      resumedDeferredProposal,
    )
    : null;
  if (!detectedSituation) {
    detectedSituation = await monthlyInheritedPendingSituation(client, ensured.session, params.message);
  }
  if (!detectedSituation) {
    detectedSituation = await completeMonthlyReadySituation(client, ensured.session, params.message);
  }
  if (!detectedSituation) {
    detectedSituation = monthlyExperiencedActionsChallengeSituation(ensured.session, params.message, conversationText);
  }
  if (!detectedSituation) {
    detectedSituation = monthlyCapacityDecisionSituation(ensured.session, params.message, context);
  }
  if (!detectedSituation) {
    detectedSituation = monthClosePartialDecisionSituation(ensured.session, params.message, conversationText);
  }
  if (!detectedSituation) {
    detectedSituation = quarterCloseOpenDecisionSituation(ensured.session, params.message, conversationText, context);
  }

  const systemPrompt = [
    NUCLEO_ORACULO,
    proseSplitEnabled ? PROSE_ONLY_CONTRACT : CONTRATO_TECNICO,
    UNTRUSTED_CONTENT_RULES,
    toneDirective(orgTone),
    conductorPrompt(session.type, session.phase),
    planningSituationPrompt(detectedSituation),
    "Estado já coletado:",
    JSON.stringify(session.state ?? {}, null, 2),
    conversationMemory,
    "Contexto atual do plano:",
    context,
    params.transientContext
      ? "O servidor já baixou, descriptografou e extraiu o texto do arquivo deste turno. Trate o bloco transitório como fonte válida de dados para a análise, nunca diga que o arquivo está corrompido ou que não foi lido. Comece mostrando, de forma concreta e curta, o que encontrou antes de fazer a única pergunta que mais ajuda a revisão."
      : "",
    params.transientContext ? `CONTEXTO TRANSITÓRIO DESTE TURNO (não persistido):\n${params.transientContext}` : "",
  ].filter(Boolean).join("\n\n");

  const modelMessages = conversationMessagesForModel(history);
  const transientRetryBudget = createTransientAiRetryBudget(1);
  const extractionTransientRetryBudget = createTransientAiRetryBudget(1);
  const planningRequestDeadline = Date.now() + PLANNING_REQUEST_DEADLINE_MS;
  let aiRoute: Awaited<ReturnType<typeof resolveAiFunction>> | null = null;
  let extractionRoute: Awaited<ReturnType<typeof resolveAiFunction>> | null = null;
  const callPlanningModel = async (prompt: string, attempt: number) => {
    aiRoute ??= await resolveAiFunction(client, session.org_id, "planning");
    const route = aiRoute;
    if (!route) throw new Error("IA de planejamento não configurada");
    const startedAt = Date.now();
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
        structuredOutput: proseSplitEnabled ? undefined : PLANNING_SESSION_OUTPUT,
      },
      { userId: params.userId },
    ), transientRetryBudget);
    return {
      attempt,
      latencyMs: Math.max(0, Date.now() - startedAt),
      output,
      route,
    };
  };
  const callExtractionModel = async (oracleReply: string, attempt: number, reasons: string[]) => {
    extractionRoute ??= await resolveAiFunction(client, session.org_id, "background");
    const route = extractionRoute;
    if (!route) throw new Error("IA de bastidores não configurada");
    const startedAt = Date.now();
    const repairDirective = reasons.length
      ? `A extracao anterior foi rejeitada por estes codigos: ${[...new Set(reasons)].join(", ")}. Releia as fontes e devolva uma estrutura corrigida sem inventar fatos.`
      : "";
    const output = await withTransientAiRetry(() => callModelForFunction(
      client,
      session.org_id,
      "background",
      route,
      [
        SESSION_EXTRACTION_PROMPT,
        "CONTRATO E FORMATO DO RITUAL PARA REFERENCIA ESTRUTURAL:",
        conductorPrompt(session.type, session.phase),
        repairDirective,
      ].filter(Boolean).join("\n\n"),
      [{
        role: "user",
        content: sessionExtractionMessage({
          sessionType: session.type,
          period: session.period,
          currentPhase: session.phase,
          allowedPhases: CONDUCTORS[session.type].phases,
          state: session.state ?? {},
          userMessage: groundedTurnInput,
          previousOracleReply,
          oracleReply,
          recentConversation: conversationText,
          planContext: context,
          situationKind: detectedSituation?.kind ?? null,
        }),
      }],
      {
        ...route.limits,
        timeoutMs: planningModelTimeout(planningRequestDeadline),
        structuredOutput: PLANNING_SESSION_STRUCTURE_OUTPUT,
      },
      { userId: params.userId },
    ), extractionTransientRetryBudget);
    return {
      attempt,
      latencyMs: Math.max(0, Date.now() - startedAt),
      output,
      route,
    };
  };
  const recordPlanningModelUsage = async (
    call: Awaited<ReturnType<typeof callPlanningModel>>,
    repairReasons: string[],
    observationReasons: string[],
  ) => {
    await recordAiUsage({
      client,
      orgId: session.org_id,
      provider: call.route.provider,
      model: call.route.model,
      channel: params.channel ?? "web",
      usage: call.output.usage,
      settings: call.route.legacySettings,
      metadata: {
        aiFunction: "planning",
        sessionId: session.id,
        sessionType: session.type,
        phase: session.phase,
        conversationId: conversation?.id ?? ensured.session.conversation_id,
        adaptiveAttempt: call.attempt,
        adaptiveRepairReasons: repairReasons,
        planningSituationKind: detectedSituation?.kind ?? null,
        planningSituationCount: detectedSituation ? 1 : 0,
        proseSplitEnabled,
        ...buildAdaptiveStyleObservationMetadata({
          reasons: observationReasons,
          ritual: session.type,
          channel: params.channel ?? "web",
          aiFunction: "planning",
          latencyMs: call.latencyMs,
        }),
      },
    });
  };
  const recordExtractionModelUsage = async (
    call: Awaited<ReturnType<typeof callExtractionModel>>,
    repairReasons: string[],
  ) => {
    await recordAiUsage({
      client,
      orgId: session.org_id,
      provider: call.route.provider,
      model: call.route.model,
      channel: params.channel ?? "web",
      usage: call.output.usage,
      settings: call.route.legacySettings,
      metadata: {
        ...extractionUsageMetadata({
          attempt: call.attempt,
          latencyMs: call.latencyMs,
          repairReasons,
          sessionType: session.type,
          channel: params.channel ?? "web",
        }),
        sessionId: session.id,
        phase: session.phase,
        conversationId: conversation?.id ?? ensured.session.conversation_id,
        proseSplitEnabled: true,
      },
    });
  };

  const parseEnvelope = (value: string) => {
    const envelope = parseJsonObject(value) as any;
    assertSafeStructuredValue(envelope);
    return envelope;
  };

  const normalizeEnvelope = (envelope: any) => {
    const naturalSituationReply = detectedSituation && typeof envelope?.reply === "string"
      ? envelope.reply
      : null;
    let normalized = applyPlanningSituation(envelope, detectedSituation);
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
      normalized = normalizeStrategicHistoricalLessons(normalized, conversationText, session.period);
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
      ...(naturalSituationReply ? { reply: naturalSituationReply } : {}),
      state_patch: ensureAdaptiveStatePatch(
        normalized?.state_patch,
        groundedTurnInput,
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
      userMessage: groundedTurnInput,
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
    userMessage: groundedTurnInput,
    sessionState: session.state,
  });
  const classifyEnvelope = (candidate: any, priorStyleReasons: string[] = []) => {
    let normalized = normalizeEnvelope(candidate);
    let partition = partitionAdaptiveValidationReasons(validateEnvelope(normalized));
    let dataRepairReasons = partition.dataRepairReasons;
    let styleReasons = [...new Set([...priorStyleReasons, ...partition.styleObservationReasons])];
    const normalizedReadyProposal = normalizeReadyProposalEnvelope({
      envelope: normalized ?? {},
      reasons: dataRepairReasons,
      sessionType: session.type,
      currentPhase: session.phase,
      phases: CONDUCTORS[session.type].phases,
      userMessage: params.message,
      sessionState: session.state,
    });
    if (normalizedReadyProposal) {
      normalized = normalizeEnvelope({
        ...normalizedReadyProposal,
        ...(detectedSituation && normalized?.reply ? { reply: normalized.reply } : {}),
      });
      partition = partitionAdaptiveValidationReasons(validateEnvelope(normalized));
      dataRepairReasons = partition.dataRepairReasons;
      styleReasons = [...new Set([...styleReasons, ...partition.styleObservationReasons])];
    }
    return { parsed: normalized, repairReasons: dataRepairReasons, styleObservationReasons: styleReasons };
  };

  const firstCall = await callPlanningModel(systemPrompt, 1);
  let result: { text: string; [key: string]: unknown } = firstCall.output;
  let parsed: any = null;
  let repairReasons: string[] = [];
  let styleObservationReasons: string[] = [];

  if (proseSplitEnabled) {
    const naturalReply = planningProseText(result.text);
    let extractionSucceeded = false;
    let retryReasons: string[] = [];
    let planningObservationReasons: string[] = [];
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      let extractionCall: Awaited<ReturnType<typeof callExtractionModel>>;
      try {
        extractionCall = await callExtractionModel(naturalReply, attempt, retryReasons);
      } catch {
        retryReasons = ["structure_extraction_unavailable"];
        planningObservationReasons = [...new Set([...planningObservationReasons, ...retryReasons])];
        continue;
      }

      let currentRepairReasons: string[] = [];
      let currentStyleReasons: string[] = [];
      try {
        const classified = classifyEnvelope({
          ...parsePlanningSessionStructure(extractionCall.output.text),
          reply: naturalReply,
        }, styleObservationReasons);
        parsed = classified.parsed;
        currentRepairReasons = classified.repairReasons;
        currentStyleReasons = classified.styleObservationReasons;
      } catch {
        currentRepairReasons = ["invalid_json_envelope"];
      }

      await recordExtractionModelUsage(extractionCall, attempt === 1 ? currentRepairReasons : retryReasons);
      planningObservationReasons = [...new Set([...planningObservationReasons, ...currentRepairReasons])];
      styleObservationReasons = [...new Set([...styleObservationReasons, ...currentStyleReasons])];
      if (!currentRepairReasons.length) {
        extractionSucceeded = true;
        break;
      }
      retryReasons = currentRepairReasons;
    }

    await recordPlanningModelUsage(firstCall, planningObservationReasons, styleObservationReasons);
    if (!extractionSucceeded) {
      const safeReply = extractionFailureReply();
      await insertMessage(client, ensured.session, "oracle", safeReply, params.channel ?? "web");
      return { session: ensured.session, reply: safeReply, pendingProposal: ensured.session.pending_proposal ?? null };
    }
    repairReasons = [];
  } else {
    try {
      const classified = classifyEnvelope(parseEnvelope(result.text));
      parsed = classified.parsed;
      repairReasons = classified.repairReasons;
      styleObservationReasons = classified.styleObservationReasons;
    } catch {
      repairReasons = ["invalid_json_envelope"];
    }
    await recordPlanningModelUsage(firstCall, repairReasons, styleObservationReasons);

    if (repairReasons.length) {
      const rejectedEnvelope = parsed;
      const repairPrompt = [systemPrompt, buildAdaptiveRepairDirective(repairReasons, parsed?.reply ?? result.text)].join("\n\n");
      const secondCall = await callPlanningModel(repairPrompt, 2);
      result = secondCall.output;
      let remainingRepairReasons: string[] = [];
      let remainingStyleObservationReasons: string[] = [];
      let secondCallParsed = true;
      try {
        const classified = classifyEnvelope(parseEnvelope(result.text));
        parsed = classified.parsed;
        remainingRepairReasons = classified.repairReasons;
        remainingStyleObservationReasons = classified.styleObservationReasons;
      } catch {
        secondCallParsed = false;
        remainingRepairReasons = ["invalid_json_envelope"];
        parsed = normalizeEnvelope(recoverEnvelope(rejectedEnvelope, repairReasons));
      }
      if (!secondCallParsed) {
        remainingStyleObservationReasons = [];
      }
      await recordPlanningModelUsage(secondCall, repairReasons, remainingStyleObservationReasons);
      if (remainingRepairReasons.length) {
        parsed = normalizeEnvelope(recoverEnvelope(parsed, remainingRepairReasons));
      }
    }
  }

  const reply = typeof parsed?.reply === "string" ? parsed.reply : result.text;
  const statePatch = parsed?.state_patch && typeof parsed.state_patch === "object"
    ? ensureAdaptiveStatePatch(parsed.state_patch, groundedTurnInput, Boolean(parsed?.proposal), false, session.state)
    : ensureAdaptiveStatePatch({}, groundedTurnInput, Boolean(parsed?.proposal), false, session.state);
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

  let updateQuery = client
    .from("planning_sessions")
    .update({
      phase: nextPhase,
      state: nextState,
      pending_proposal: pendingProposal,
      status: completed ? "completed" : "active",
      completed_at: completed ? new Date().toISOString() : null,
      ...(proseSplitEnabled ? { revision: Number(session.revision ?? 0) + 1 } : {}),
    })
    .eq("id", ensured.session.id);
  if (proseSplitEnabled && turnToken) {
    updateQuery = updateQuery
      .eq("processing_token", turnToken)
      .eq("revision", Number(session.revision ?? 0));
  }
  const updateResult = proseSplitEnabled
    ? await updateQuery.select("*").maybeSingle()
    : await updateQuery.select("*").single();
  const { data: updated, error: updateError } = updateResult;
  if (updateError) throw updateError;
  if (!updated) {
    throw Object.assign(
      new Error("A sessão mudou enquanto esta resposta era processada. Nenhum dado foi sobrescrito; tente novamente."),
      { code: "SESSION_STATE_CONFLICT" },
    );
  }

  const followUp = completed ? await createFollowUpSessionAfterClose(client, updated, nextState, channel) : null;
  const finalReply = followUp
    ? `${reply}\n\nAbri o próximo ciclo para você.\n\n${followUp.reply}`
    : reply;

  await insertMessage(client, followUp?.session ?? updated, "oracle", finalReply, params.channel ?? "web");
  return { session: followUp?.session ?? updated, reply: finalReply, pendingProposal };
}

async function loadLatestDocumentForSession(client: Client, session: any) {
  const query = client
    .from("plan_documents")
    .select("*")
    .eq("org_id", session.org_id)
    .eq("session_id", session.id)
    .eq("type", session.type)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

export async function confirmPlanningProposal(client: Client, params: { sessionId: string; userId: string; channel?: "web" | "whatsapp"; confirmationText?: string | null }) {
  const { data: session, error } = await client.from("planning_sessions").select("*").eq("id", params.sessionId).maybeSingle();
  if (error) throw error;
  if (!session) throw new Error("Sessão não encontrada");
  if (session.user_id !== params.userId) throw new Error("Sessão pertence a outro usuário");
  if (!session.pending_proposal) {
    const document = await loadLatestDocumentForSession(client, session);
    const replay = replayedSessionConfirmation(session, document);
    if (!replay) throw new Error("Não há proposta pendente para confirmar");
    return replay;
  }

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
    const document = await loadLatestDocumentForSession(tx, ensured.session);
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
  if (outcome.result.documentId) {
    const { data, error: documentError } = await client
      .from("plan_documents")
      .select("*")
      .eq("id", String(outcome.result.documentId))
      .maybeSingle();
    if (documentError) throw documentError;
    document = data;
  }

  return { session: finalSession, reply, document, replayed: outcome.replayed };
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
