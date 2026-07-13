import { describe, expect, it, vi } from "vitest";
import {
  inferPlanningType,
  nextMonthPeriod,
  nextQuarterPeriod,
  normalizeTextForRouting,
  periodForClose,
  periodForPlanning,
  previousQuarterPeriod,
} from "./periods.ts";

describe("períodos server-side", () => {
  it("normaliza acentos e identifica os três tipos", () => {
    expect(normalizeTextForRouting("  MARÇO  ")).toBe("marco");
    expect(inferPlanningType("plano anual da empresa")).toBe("strategic");
    expect(inferPlanningType("planejamento do terceiro trimestre")).toBe("quarterly");
    expect(inferPlanningType("revisão mensal de março")).toBe("monthly");
    expect(inferPlanningType("como foi a semana?")).toBeNull();
  });

  it("interpreta trimestre e mês por extenso sem depender do relógio", () => {
    expect(periodForPlanning("quarterly", null, "terceiro trimestre de 2027")).toBe("T3 2027");
    expect(periodForPlanning("monthly", null, "fevereiro de 2028")).toBe("Fev 2028");
    expect(periodForPlanning("strategic", "2029")).toBe("2029");
  });

  it("avança mês e trimestre cruzando o ano", () => {
    expect(nextMonthPeriod("Dez 2026")).toBe("Jan 2027");
    expect(nextQuarterPeriod("T4 2026")).toBe("T1 2027");
  });

  it("fechamento sem período usa o período anterior", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15));
    expect(periodForClose("monthly", null)).toBe("Dez 2025");
    expect(periodForClose("quarterly", null)).toBe("T4 2025");
    expect(previousQuarterPeriod()).toBe("T4 2025");
    vi.useRealTimers();
  });
});
