import type { AppState, Objective, Status } from "../types";
import { STATUS_LABEL } from "../types";
import { evaluateConcreteness, hasObservableResult } from "./concreteness";

const statusOrder: Status[] = ["on_track", "at_risk", "late", "done"];

function formatList(items: string[]) {
  return items.length ? items.join("; ") : "nenhum ponto crítico";
}

export function createMessageId(prefix = "chat") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function generatePlantingAlert(state: AppState) {
  const strategic = state.objectives.filter((objective) => objective.level === "strategic");
  const harvest = strategic.filter((objective) => objective.type === "harvest");
  const seedAtRisk = strategic.find(
    (objective) => objective.type === "seed" && ["at_risk", "late"].includes(objective.status),
  );
  const harvestOk = harvest.length > 0 && harvest.every((objective) => ["on_track", "done"].includes(objective.status));

  if (!harvestOk || !seedAtRisk) return null;

  return `A empresa está dentro da meta do mês, mas o plantio está descoberto. ${seedAtRisk.title} está ${STATUS_LABEL[seedAtRisk.status].toLowerCase()}. Qual evidência prova que avançou?`;
}

export function generateWeeklyReview(state: AppState) {
  const counts = statusOrder
    .map((status) => `${state.objectives.filter((objective) => objective.status === status).length} ${STATUS_LABEL[status].toLowerCase()}`)
    .join(", ");

  const attention = state.objectives
    .filter((objective) => ["at_risk", "late"].includes(objective.status))
    .map((objective) => `${objective.title} (${objective.owner}, ${STATUS_LABEL[objective.status].toLowerCase()})`);

  const noEvidenceCount = state.objectives.filter(
    (objective) => !state.evidences.some((evidence) => evidence.objectiveId === objective.id),
  ).length;

  const planting = generatePlantingAlert(state);

  return [
    `Revisão semanal: ${counts}.`,
    `Pontos de atenção: ${formatList(attention)}.`,
    noEvidenceCount > 0 ? `${noEvidenceCount} objetivo(s) sem evidência registrada.` : "As evidências principais estão registradas.",
    planting ?? "O plantio segue no radar. Qual evidência nova prova avanço nesta semana?",
  ].join(" ");
}

export function respondToUserMessage(message: string, state: AppState) {
  const normalized = message.toLowerCase();
  if (normalized.includes("resumo") || normalized.includes("semana")) {
    return generateWeeklyReview(state);
  }
  if (normalized.includes("risco") || normalized.includes("atras")) {
    const risky = state.objectives
      .filter((objective) => ["at_risk", "late"].includes(objective.status))
      .map((objective) => `${objective.title}, com ${objective.owner}`);
    return risky.length
      ? `Hoje eu olharia estes pontos: ${formatList(risky)}. Qual evidência mostra avanço real em algum deles?`
      : "Nenhum objetivo crítico agora. Mantém a cadência e registra evidência do que avançou.";
  }
  if (normalized.includes("evid")) {
    const withoutEvidence = state.objectives.filter(
      (objective) => !state.evidences.some((evidence) => evidence.objectiveId === objective.id),
    );
    return withoutEvidence.length
      ? `${withoutEvidence.length} objetivo(s) ainda estão sem evidência registrada. Comece pelo que está em risco ou atrasado.`
      : "As evidências principais estão registradas. O próximo passo é manter a cadência semanal.";
  }
  if (normalized.includes("plantio") || normalized.includes("evolu")) {
    return generatePlantingAlert(state) ?? "O plantio aparece nos objetivos de Evolução. O foco é proteger futuro sem soltar o Resultado.";
  }

  return "Estou aqui para conduzir plano, cobrar evidência e vigiar Resultado e Evolução. Posso revisar a semana, apontar riscos ou registrar uma evidência.";
}

export interface PastedPlanReview {
  concrete: string[];
  generic: string[];
  missing: string[];
}

function looksLikeObjective(line: string) {
  const normalized = line.trim();
  if (normalized.length < 8) return false;
  return /^[-*\d.]|\b(objetivo|meta|aumentar|reduzir|fechar|entregar|implantar|lançar|concluir|validar|formar)\b/i.test(normalized);
}

function hasDeadlineText(line: string) {
  return /\b(20\d{2}|janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|q[1-4]|trimestre|até|dia\s+\d{1,2})\b/i.test(
    line,
  );
}

function hasOwnerText(line: string) {
  return /\b(responsável|dono|owner|coordena|com\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ-]+)\b/.test(line);
}

export function reviewPastedPlan(text: string): PastedPlanReview {
  const candidates = text
    .split(/\n|(?<=[.!?])\s+/)
    .map((line) => line.trim().replace(/^[-*\d.)\s]+/, ""))
    .filter(looksLikeObjective);

  const concrete: string[] = [];
  const generic: string[] = [];
  let hasPlanting = false;
  let hasDiagnosis = false;
  let hasLinkedProjects = false;

  for (const line of candidates) {
    const signals = [
      hasObservableResult(line),
      hasDeadlineText(line),
      hasOwnerText(line),
    ].filter(Boolean).length;

    if (/lider|trein|padron|process|produto|inova|pipeline|capacidade|autonomia/i.test(line)) {
      hasPlanting = true;
    }
    if (/força|fraqueza|oportunidade|ameaça|swot|diagnóstico/i.test(line)) {
      hasDiagnosis = true;
    }
    if (/projeto|iniciativa/i.test(line) && /objetivo|meta|ligad|puxa/i.test(line)) {
      hasLinkedProjects = true;
    }

    if (signals >= 2) {
      concrete.push(line);
    } else if (signals === 0) {
      generic.push(line);
    }
  }

  const missing: string[] = [];
  if (!candidates.length) missing.push("Não encontrei objetivos claros no texto colado.");
  if (!candidates.some(hasDeadlineText)) missing.push("Faltam prazos visíveis nos objetivos.");
  if (!candidates.some(hasOwnerText)) missing.push("Faltam responsáveis nominais.");
  if (!hasPlanting) missing.push("O conjunto ainda não mostra plantio de futuro.");
  if (!hasDiagnosis && !/swot|forças|fraquezas|oportunidades|ameaças|diagnóstico/i.test(text)) {
    missing.push("Não encontrei diagnóstico ou SWOT.");
  }
  if (!hasLinkedProjects && /projeto|iniciativa/i.test(text)) {
    missing.push("Os projetos aparecem sem vínculo claro com objetivos.");
  }

  return {
    concrete,
    generic,
    missing,
  };
}

export function buildSavedObjectiveResponse(objective: Objective) {
  const result = evaluateConcreteness(objective);
  const suffix = result.belowRecommended
    ? ` Está ${result.range.toLowerCase()} e pode evoluir: ${result.firstMissing?.invitation ?? "defina o próximo sinal."}`
    : ` Está ${result.range.toLowerCase()}. Agora cobre evidência.`;
  return `Objetivo salvo: ${objective.title}.${suffix}`;
}

// V2: substituir os roteiros determinísticos acima por uma chamada ao modelo real.
// A régua de concretude continua determinística; o modelo entra para interpretar texto livre e conduzir a conversa.
