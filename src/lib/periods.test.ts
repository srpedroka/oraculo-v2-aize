import { describe, expect, it } from "vitest";
import { currentMonthPeriod, currentQuarterPeriod, currentYear, previousMonthPeriod } from "./periods";

describe("períodos do frontend", () => {
  it("mantém ano, mês e trimestre no formato canônico", () => {
    const date = new Date(2026, 6, 13);
    expect(currentYear(date)).toBe(2026);
    expect(currentMonthPeriod(date)).toBe("Jul 2026");
    expect(currentQuarterPeriod(date)).toBe("T3 2026");
  });

  it("vira janeiro para dezembro do ano anterior", () => {
    expect(previousMonthPeriod(new Date(2026, 0, 10))).toBe("Dez 2025");
  });
});
