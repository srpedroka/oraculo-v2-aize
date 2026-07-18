import { describe, expect, it } from "vitest";
import rubric from "../../tests/evals/strategic-quality/rubric.json";
import { q4dJudgeRubric } from "../../scripts/strategic-q4d-rubric";

describe("Q4D applicable rubric", () => {
  it("normalizes the applicable criteria to a 100-point gate", () => {
    const applicable = q4dJudgeRubric(rubric);
    const criteria = applicable.rubrics[0].criteria as Array<{ id: string; weight: number }>;
    const totalWeight = criteria.reduce((sum, item) => sum + item.weight, 0);

    expect(criteria.map((item) => item.id)).not.toContain("COND-MEMORY-001");
    expect(totalWeight).toBeCloseTo(100, 6);
  });
});
