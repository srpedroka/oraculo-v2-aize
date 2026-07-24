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

export function reviewApplicationState(document: any) {
  return {
    review_intent: REVIEW_APPLICATION_INTENT,
    source_review_document_id: asText(document?.id),
    source_review_title: asText(document?.title, "Revisão Estratégica"),
    source_review_version: Number(document?.version ?? 1),
    required_annual_plan_mode: "update_current_year",
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
  return [
    `Vinculei “${title}” (v${version}) ao Plano Estratégico ${period}.`,
    "Agora vou comparar o que a revisão decidiu com o plano vigente e separar o que deve ser mantido, alterado, criado ou retirado.",
    "Antes de gravar, você verá o antes e depois em uma única confirmação. Existe alguma decisão dessa revisão que não deve entrar no plano anual?",
  ].join("\n\n");
}

export function reviewApplicationDirective(stateValue: unknown) {
  if (!isReviewApplicationState(stateValue)) return "";
  const state = asRecord(stateValue);
  return [
    "MISSÃO ATIVA: aplicar uma revisão estratégica já aprovada ao Plano Estratégico Anual vigente.",
    `Documento selecionado: ${asText(state.source_review_title, "Revisão Estratégica")} (v${Number(state.source_review_version ?? 1)}).`,
    "Não reinicie a revisão do semestre e não volte a perguntar o contexto que já está no documento.",
    "Compare a revisão vinculada com o plano anual atual. Conduza somente as decisões ainda ambíguas.",
    "A proposta final deve usar annual_plan_update.mode = update_current_year e mostrar manter, atualizar, criar ou retirar com justificativa e antes/depois.",
    "Se a revisão não sustentar uma mudança concreta, explique a ausência de diferença em vez de inventar alteração.",
    "Peça uma única confirmação para gravar revisão e nova versão do plano.",
  ].join("\n");
}

export function validateReviewApplicationEnvelope(stateValue: unknown, envelopeValue: unknown) {
  if (!isReviewApplicationState(stateValue)) return [];
  const envelope = asRecord(envelopeValue);
  const proposal = asRecord(envelope.proposal);
  if (!Object.keys(proposal).length) return [];
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
  const adjustments = Array.isArray(proposal.adjustments ?? proposal.ajustes)
    ? proposal.adjustments ?? proposal.ajustes
    : [];
  if (!Object.keys(planChanges).length && !objectiveChanges.length && !adjustments.length) {
    return ["review_application_without_changes"];
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
