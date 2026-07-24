import { formatUntrustedDocument } from "./untrusted-content.ts";

export const REVIEW_APPLICATION_INTENT = "apply_existing_review";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asText(value: unknown, fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function normalizedText(value: unknown) {
  return asText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

const EXPLICIT_CONFIRMATION_PATTERN =
  /^(?:sim|confirmo|confirmado|confirma|pode\s+confirmar|pode\s+gravar|grave|grava|aprovado|esta\s+aprovado|pode\s+seguir)\b/;

function reviewProposalWasPresented(value: unknown) {
  const content = normalizedText(value);
  if (!content) return false;
  const signals = [
    /atualiz(?:acao|ar|ado)[\s\S]{0,100}plano\s+(?:estrategico|anual)/.test(content),
    /objetiv(?:o|os)[\s\S]{0,100}(?:propost|atualiz|nov|criar|manter)/.test(content),
    /projetos?\s+(?:estrategicos|prioritarios)|projetos?[\s\S]{0,80}materializar/.test(content),
  ];
  const asksConfirmation = /confirm(?:a|o|ar|acao)|se\s+estiver\s+de\s+acordo/.test(content);
  return signals.every(Boolean) && asksConfirmation;
}

function sourcePriorityKey(value: unknown, index: number) {
  return asText(value, `priority-${index + 1}`).toLowerCase();
}

export interface ReviewPriorityRequirement {
  key: string;
  title: string;
  linkedObjectiveId: string;
  firstAction: string;
}

export function reviewApplicationRequirements(contentValue: unknown) {
  const content = asRecord(contentValue);
  const semesterReview = asRecord(content.revisao_semestre);
  const secondSemesterPlan = asRecord(content.plano_segundo_semestre);
  const priorities = asArray(secondSemesterPlan.prioridades).map((value, index) => {
    const priority = asRecord(value);
    return {
      key: sourcePriorityKey(priority.source_priority_key ?? priority.chave_origem, index),
      title: asText(priority.titulo, `Prioridade ${index + 1}`),
      linkedObjectiveId: asText(priority.objetivo_vinculado_id),
      firstAction: asText(priority.primeira_acao),
    };
  });

  return {
    priorities,
    requiresReviewContext: Boolean(asText(semesterReview.resumo_executivo)),
    requiresCadence: asArray(secondSemesterPlan.cadencia).length > 0,
    requiresRenunciations: asArray(secondSemesterPlan.renuncias).length > 0,
    requiresRisks: asArray(semesterReview.riscos).length > 0 || asArray(secondSemesterPlan.riscos).length > 0,
    requiresLessons: asArray(semesterReview.aprendizados).length > 0
      || asArray(semesterReview.padroes_repetidos).length > 0,
  };
}

function applicationWasRecorded(contentValue: unknown) {
  const content = asRecord(contentValue);
  const annualUpdate = asRecord(content.atualizacao_plano_anual);
  const updatedDocument = asRecord(content.documento_plano_anual_atualizado);
  return content.plano_anual_atualizado === true
    || asText(annualUpdate.modo) === "update_current_year"
    || Boolean(asText(updatedDocument.id));
}

export function reviewApplicationNeedsRepair(contentValue: unknown) {
  if (!applicationWasRecorded(contentValue)) return false;
  const content = asRecord(contentValue);
  const materialization = asRecord(content.materializacao_revisao);
  if (materialization.completa === true) return false;

  const requirements = reviewApplicationRequirements(content);
  if (!requirements.priorities.length) return false;
  const annualUpdate = asRecord(content.atualizacao_plano_anual);
  const objectiveChanges = asArray(annualUpdate.mudancas_objetivos);
  const projectChanges = asArray(annualUpdate.mudancas_projetos);
  if (objectiveChanges.length < requirements.priorities.length) return true;
  const prioritiesWithAction = requirements.priorities.filter((priority) => priority.firstAction);
  return projectChanges.length < prioritiesWithAction.length;
}

export function reviewApplicationState(document: any) {
  const requirements = reviewApplicationRequirements(document?.content);
  return {
    review_intent: REVIEW_APPLICATION_INTENT,
    source_review_document_id: asText(document?.id),
    source_review_title: asText(document?.title, "Revisão Estratégica"),
    source_review_version: Number(document?.version ?? 1),
    required_annual_plan_mode: "update_current_year",
    review_application_repair: reviewApplicationNeedsRepair(document?.content),
    required_review_priorities: requirements.priorities,
  };
}

export function isReviewApplicationState(value: unknown) {
  const state = asRecord(value);
  return state.review_intent === REVIEW_APPLICATION_INTENT
    && Boolean(asText(state.source_review_document_id));
}

export function reviewApplicationOpening(document: any, period: string) {
  const title = asText(document?.title, `Revisão Estratégica ${period}`);
  const version = Number(document?.version ?? 1);
  const repair = reviewApplicationNeedsRepair(document?.content);
  return [
    `Vinculei “${title}” (v${version}) ao Plano Estratégico ${period}.`,
    repair
      ? "A atualização anterior ficou incompleta. Vou preservar a revisão aprovada e completar a materialização do contexto, objetivos e projetos no plano vigente."
      : "Agora vou comparar o que a revisão decidiu com o plano vigente e separar o que deve ser mantido, alterado, criado ou retirado.",
    "Antes de gravar, você verá o antes e depois em uma única confirmação. Existe alguma decisão dessa revisão que não deve entrar no plano anual?",
  ].join("\n\n");
}

export function reviewApplicationDirective(stateValue: unknown) {
  if (!isReviewApplicationState(stateValue)) return "";
  const state = asRecord(stateValue);
  const priorities = asArray(state.required_review_priorities).map((value) => {
    const priority = asRecord(value);
    const action = asText(priority.firstAction);
    return `- ${asText(priority.key)}: ${asText(priority.title)}${action ? ` | primeira ação: ${action}` : ""}`;
  });
  return [
    "MISSÃO ATIVA: aplicar uma revisão estratégica já aprovada ao Plano Estratégico Anual vigente.",
    `Documento selecionado: ${asText(state.source_review_title, "Revisão Estratégica")} (v${Number(state.source_review_version ?? 1)}).`,
    "Não reinicie a revisão do semestre e não volte a perguntar o contexto que já está no documento.",
    "Compare a revisão vinculada com o plano anual atual. Conduza somente as decisões ainda ambíguas.",
    "A revisão selecionada já foi aprovada pelo owner: seu contexto, foco, cadência, riscos, renúncias e aprendizados serão incorporados pelo servidor e não podem ser reduzidos a um resumo genérico.",
    "Cada prioridade listada abaixo precisa aparecer em objectiveChanges com operation keep, update ou create e sourcePriorityKey.",
    "Quando a prioridade tiver primeira ação, ela também precisa aparecer em projectChanges com operation keep, update ou create e o mesmo sourcePriorityKey.",
    ...priorities,
    "A proposta final deve usar annual_plan_update.mode = update_current_year e mostrar manter, atualizar, criar ou retirar com justificativa e antes/depois.",
    "Use projectChanges para os projetos prioritários. Não trate primeira ação como simples texto solto.",
    "Peça uma única confirmação para gravar revisão e nova versão do plano.",
  ].join("\n");
}

export function validateReviewApplicationEnvelope(
  stateValue: unknown,
  envelopeValue: unknown,
  context: {
    userMessage?: unknown;
    previousOracleReply?: unknown;
    conversationText?: unknown;
  } = {},
) {
  if (!isReviewApplicationState(stateValue)) return [];
  const envelope = asRecord(envelopeValue);
  const proposal = asRecord(envelope.proposal);
  if (!Object.keys(proposal).length) {
    const confirmationWithoutPendingProposal = EXPLICIT_CONFIRMATION_PATTERN.test(normalizedText(context.userMessage))
      && reviewProposalWasPresented([
        asText(context.previousOracleReply),
        asText(context.conversationText),
      ].filter(Boolean).join("\n"));
    if (reviewProposalWasPresented(envelope.reply) || confirmationWithoutPendingProposal) {
      return ["review_application_ready_without_proposal"];
    }
    return [];
  }
  if (asText(proposal.type) !== "apply_strategic_review") {
    return ["review_application_wrong_proposal"];
  }

  const annualUpdate = asRecord(
    proposal.annual_plan_update ?? proposal.annualPlanUpdate ?? proposal.atualizacao_plano_anual,
  );
  const mode = asText(annualUpdate.mode ?? annualUpdate.modo).toLowerCase();
  if (mode !== "update_current_year") {
    return ["review_application_preserved_plan"];
  }

  const planChanges = asRecord(
    annualUpdate.planChanges ?? annualUpdate.plan_changes ?? annualUpdate.alteracoes_plano,
  );
  const objectiveChanges = Array.isArray(
    annualUpdate.objectiveChanges ?? annualUpdate.objective_changes ?? annualUpdate.mudancas_objetivos,
  )
    ? annualUpdate.objectiveChanges ?? annualUpdate.objective_changes ?? annualUpdate.mudancas_objetivos
    : [];
  const projectChanges = Array.isArray(
    annualUpdate.projectChanges ?? annualUpdate.project_changes ?? annualUpdate.mudancas_projetos,
  )
    ? annualUpdate.projectChanges ?? annualUpdate.project_changes ?? annualUpdate.mudancas_projetos
    : [];
  const adjustments = Array.isArray(proposal.adjustments ?? proposal.ajustes)
    ? proposal.adjustments ?? proposal.ajustes
    : [];
  if (!Object.keys(planChanges).length && !objectiveChanges.length && !projectChanges.length && !adjustments.length) {
    return ["review_application_without_changes"];
  }

  const requiredPriorities = asArray(asRecord(stateValue).required_review_priorities)
    .map((value, index) => {
      const priority = asRecord(value);
      return {
        key: sourcePriorityKey(priority.key, index),
        firstAction: asText(priority.firstAction),
      };
    });
  if (!requiredPriorities.length) return [];

  const objectiveCoverage = new Set(objectiveChanges.map((value: unknown, index: number) => {
    const change = asRecord(value);
    const operation = asText(change.operation ?? change.operacao).toLowerCase();
    if (!["keep", "update", "create"].includes(operation)) return "";
    return sourcePriorityKey(change.sourcePriorityKey ?? change.source_priority_key ?? change.chave_origem, index);
  }).filter(Boolean));
  if (requiredPriorities.some((priority) => !objectiveCoverage.has(priority.key))) {
    return ["review_application_incomplete_objective_coverage"];
  }

  const projectCoverage = new Set(projectChanges.map((value: unknown, index: number) => {
    const change = asRecord(value);
    const operation = asText(change.operation ?? change.operacao).toLowerCase();
    if (!["keep", "update", "create"].includes(operation)) return "";
    return sourcePriorityKey(change.sourcePriorityKey ?? change.source_priority_key ?? change.chave_origem, index);
  }).filter(Boolean));
  if (requiredPriorities.some((priority) => priority.firstAction && !projectCoverage.has(priority.key))) {
    return ["review_application_incomplete_project_coverage"];
  }
  return [];
}

export function reviewApplicationContext(document: any) {
  return formatUntrustedDocument({
    fileName: `${asText(document?.title, "Revisão Estratégica")} · versão ${Number(document?.version ?? 1)}`,
    content: JSON.stringify(document?.content ?? {}),
    maxChars: 30_000,
  });
}
