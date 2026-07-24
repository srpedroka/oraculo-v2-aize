import type { PlanDocument } from "../types";

export interface StrategicReviewLineage {
  review: PlanDocument | null;
  basePlan: PlanDocument | null;
  resultingPlan: PlanDocument | null;
  reviewCycle: "midyear" | "year_end";
  updateMode: "preserve" | "update_current_year" | "prepare_next_year";
  canApplyToCurrentPlan: boolean;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asText(value: unknown) {
  return String(value ?? "").trim();
}

function documentTime(document: PlanDocument) {
  return new Date(document.createdAt).getTime();
}

function belongsToYear(document: PlanDocument, year: number) {
  return document.period.includes(String(year));
}

export function buildStrategicReviewLineage(
  documents: PlanDocument[],
  year: number,
): StrategicReviewLineage {
  const reviews = documents
    .filter((document) => document.type === "strategic_review" && belongsToYear(document, year))
    .sort((a, b) => documentTime(b) - documentTime(a) || b.version - a.version);
  const review = reviews[0] ?? null;
  const strategicDocuments = documents
    .filter((document) => document.type === "strategic" && belongsToYear(document, year))
    .sort((a, b) => b.version - a.version || documentTime(b) - documentTime(a));

  if (!review) {
    return {
      review: null,
      basePlan: strategicDocuments[0] ?? null,
      resultingPlan: null,
      reviewCycle: "midyear",
      updateMode: "preserve",
      canApplyToCurrentPlan: false,
    };
  }

  const annualUpdate = asRecord(review.content.atualizacao_plano_anual);
  const updatedDocument = asRecord(review.content.documento_plano_anual_atualizado);
  const updatedDocumentId = asText(updatedDocument.id);
  const reviewCycle = asText(review.content.ciclo_revisao) === "year_end" ? "year_end" : "midyear";
  const rawMode = asText(annualUpdate.modo);
  const updateMode = rawMode === "update_current_year" || rawMode === "prepare_next_year"
    ? rawMode
    : "preserve";
  const resultingPlan = updatedDocumentId
    ? strategicDocuments.find((document) => document.id === updatedDocumentId) ?? null
    : null;
  const resultVersion = resultingPlan?.version ?? Number(updatedDocument.versao ?? 0);
  const basePlan = strategicDocuments.find((document) => (
    document.id !== updatedDocumentId
    && (!resultVersion || document.version < resultVersion)
  )) ?? strategicDocuments.find((document) => document.id !== updatedDocumentId) ?? null;
  const wasApplied = review.content.plano_anual_atualizado === true
    || updateMode === "update_current_year"
    || Boolean(updatedDocumentId);

  return {
    review,
    basePlan,
    resultingPlan,
    reviewCycle,
    updateMode,
    canApplyToCurrentPlan: reviewCycle === "midyear" && !wasApplied,
  };
}
