import { describe, expect, it } from "vitest";
import type { PlanDocument } from "../types";
import { buildStrategicReviewLineage } from "./strategicReviewLineage";

function document(
  id: string,
  type: PlanDocument["type"],
  version: number,
  createdAt: string,
  content: Record<string, unknown> = {},
): PlanDocument {
  return {
    id,
    orgId: "org-1",
    areaId: null,
    sessionId: null,
    type,
    origin: "session",
    period: "2026",
    title: `${type} ${version}`,
    content,
    version,
    createdBy: "owner-1",
    createdAt,
  };
}

describe("linhagem da revisão estratégica", () => {
  it("oferece aplicar a revisão preservada ao plano vigente", () => {
    const result = buildStrategicReviewLineage([
      document("plan-v1", "strategic", 1, "2026-01-05T10:00:00Z"),
      document("review-v1", "strategic_review", 1, "2026-07-23T10:00:00Z", {
        ciclo_revisao: "midyear",
        plano_anual_original_preservado: true,
        atualizacao_plano_anual: { modo: "preserve" },
      }),
    ], 2026);

    expect(result.review?.id).toBe("review-v1");
    expect(result.basePlan?.id).toBe("plan-v1");
    expect(result.resultingPlan).toBeNull();
    expect(result.canApplyToCurrentPlan).toBe(true);
  });

  it("liga a revisão aplicada à nova versão do plano", () => {
    const result = buildStrategicReviewLineage([
      document("plan-v1", "strategic", 1, "2026-01-05T10:00:00Z"),
      document("plan-v2", "strategic", 2, "2026-07-23T10:00:00Z"),
      document("review-v2", "strategic_review", 2, "2026-07-23T10:00:01Z", {
        ciclo_revisao: "midyear",
        plano_anual_atualizado: true,
        documento_plano_anual_atualizado: { id: "plan-v2", versao: 2 },
        atualizacao_plano_anual: { modo: "update_current_year" },
      }),
    ], 2026);

    expect(result.basePlan?.id).toBe("plan-v1");
    expect(result.resultingPlan?.id).toBe("plan-v2");
    expect(result.canApplyToCurrentPlan).toBe(false);
  });

  it("nunca oferece reescrever o plano encerrado", () => {
    const result = buildStrategicReviewLineage([
      document("plan-v1", "strategic", 1, "2026-01-05T10:00:00Z"),
      document("review-final", "strategic_review", 1, "2026-12-31T10:00:00Z", {
        ciclo_revisao: "year_end",
        atualizacao_plano_anual: { modo: "prepare_next_year" },
      }),
    ], 2026);

    expect(result.reviewCycle).toBe("year_end");
    expect(result.canApplyToCurrentPlan).toBe(false);
  });
});
