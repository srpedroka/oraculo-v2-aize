import { describe, expect, it } from "vitest";
import {
  isReviewApplicationState,
  reviewApplicationContext,
  reviewApplicationDirective,
  reviewApplicationOpening,
  reviewApplicationState,
  validateReviewApplicationEnvelope,
} from "./strategic-review-application.ts";

const review = {
  id: "review-1",
  title: "Revisão Semestral 2026",
  version: 2,
  content: {
    plano_anual_original_preservado: true,
    revisao_semestre: { resumo_executivo: "A fábrica virou a prioridade." },
    plano_segundo_semestre: { foco: "Produtividade" },
  },
};

describe("aplicação de revisão estratégica", () => {
  it("cria estado e abertura específicos para o documento", () => {
    const state = reviewApplicationState(review);

    expect(state).toMatchObject({
      review_intent: "apply_existing_review",
      source_review_document_id: "review-1",
      source_review_version: 2,
      required_annual_plan_mode: "update_current_year",
    });
    expect(isReviewApplicationState(state)).toBe(true);
    expect(reviewApplicationOpening(review, "2026")).toContain("Vinculei “Revisão Semestral 2026” (v2)");
  });

  it("orienta a IA a comparar e não reiniciar a entrevista", () => {
    const directive = reviewApplicationDirective(reviewApplicationState(review));

    expect(directive).toContain("Não reinicie a revisão do semestre");
    expect(directive).toContain("update_current_year");
    expect(directive).toContain("uma única confirmação");
  });

  it("encapsula o conteúdo da revisão como fonte não confiável", () => {
    const context = reviewApplicationContext(review);

    expect(context).toContain("<oraculo_untrusted_document>");
    expect(context).toContain("A fábrica virou a prioridade.");
    expect(context).toContain("</oraculo_untrusted_document>");
  });

  it("recusa proposta que tenta preservar novamente ou atualizar sem diferença", () => {
    const state = reviewApplicationState(review);

    expect(validateReviewApplicationEnvelope(state, {
      proposal: {
        type: "apply_strategic_review",
        annual_plan_update: { mode: "preserve" },
      },
    })).toEqual(["review_application_preserved_plan"]);
    expect(validateReviewApplicationEnvelope(state, {
      proposal: {
        type: "apply_strategic_review",
        annual_plan_update: { mode: "update_current_year", planChanges: {}, objectiveChanges: [] },
      },
    })).toEqual(["review_application_without_changes"]);
    expect(validateReviewApplicationEnvelope(state, {
      proposal: {
        type: "apply_strategic_review",
        annual_plan_update: {
          mode: "update_current_year",
          planChanges: { executiveSummary: "Novo foco" },
        },
      },
    })).toEqual([]);
  });
});
