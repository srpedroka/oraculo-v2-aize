import { describe, expect, it } from "vitest";
import { canonicalizePlanningEnvelopeScope } from "./session-canonical-envelope.ts";

describe("canonical planning session envelope", () => {
  it("keeps annual year and scope under server ownership", () => {
    const result = canonicalizePlanningEnvelopeScope({
      sessionType: "strategic",
      sessionPeriod: "2027",
      envelope: {
        proposal: {
          type: "save_strategic_plan",
          year: 2026,
          org_id: "foreign-org",
          areaId: "foreign-area",
          objectives: [{ title: "Crescer", period: "2026" }],
        },
      },
    }) as Record<string, any>;

    expect(result.proposal.year).toBe(2027);
    expect(result.proposal.objectives[0].period).toBe("2027");
    expect(result.proposal).not.toHaveProperty("org_id");
    expect(result.proposal).not.toHaveProperty("areaId");
  });

  it("uses the quarterly and monthly periods from the active session", () => {
    const quarterly = canonicalizePlanningEnvelopeScope({
      sessionType: "quarterly",
      sessionPeriod: "T3 2027",
      envelope: { proposal: { type: "save_quarterly_plan", period: "T2 2026", quarterlyObjectives: [{ period: "T2 2026" }] } },
    }) as Record<string, any>;
    const monthly = canonicalizePlanningEnvelopeScope({
      sessionType: "monthly",
      sessionPeriod: "Ago 2027",
      envelope: { proposal: { type: "save_monthly_plan", period: "Jul 2027", objectives: [{ period: "Jul 2027" }] } },
    }) as Record<string, any>;

    expect(quarterly.proposal.period).toBe("T3 2027");
    expect(quarterly.proposal.quarterlyObjectives[0].period).toBe("T3 2027");
    expect(monthly.proposal.period).toBe("Ago 2027");
    expect(monthly.proposal.objectives[0].period).toBe("Ago 2027");
  });
});
