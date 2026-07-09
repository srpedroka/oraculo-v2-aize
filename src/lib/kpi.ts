import type { ExecutiveKpi, KpiDirection, KpiMonthlyValue, KpiUnit, LadderStage } from "../types";

export const KPI_MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function currentYear() {
  return new Date().getFullYear();
}

export function currentMonth() {
  return new Date().getMonth() + 1;
}

export function latestClosedKpiPeriod(referenceDate = new Date()) {
  const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function formatKpiValue(value: number | null | undefined, unit: KpiUnit, options: { compact?: boolean } = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";

  if (unit === "currency") {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      notation: options.compact ? "compact" : "standard",
      maximumFractionDigits: options.compact ? 1 : 0,
    }).format(value);
  }

  if (unit === "percent") {
    return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
  }

  return new Intl.NumberFormat("pt-BR", {
    notation: options.compact ? "compact" : "standard",
    maximumFractionDigits: unit === "count" ? 0 : 1,
  }).format(value);
}

export function formatAttainment(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

export function attainment(actual: number | null | undefined, target: number | null | undefined, direction: KpiDirection) {
  if (actual === null || actual === undefined || target === null || target === undefined || target === 0) return null;
  if (!Number.isFinite(actual) || !Number.isFinite(target)) return null;
  return direction === "lower_better" ? target / actual : actual / target;
}

export function orderedLadder(ladder: LadderStage[]) {
  return [...ladder].sort((left, right) => left.order - right.order);
}

export function ladderLabel(ladder: LadderStage[], stageKey: string | null | undefined) {
  if (!stageKey) return null;
  return orderedLadder(ladder).find((stage) => stage.key === stageKey)?.label ?? stageKey;
}

export function valuesForKpi(values: KpiMonthlyValue[], kpi: ExecutiveKpi, year: number) {
  return KPI_MONTHS.map((_, index) => {
    const month = index + 1;
    return values.find((value) => value.kpiId === kpi.id && value.year === year && value.month === month) ?? null;
  });
}

export function cashDeltas(monthValues: Array<KpiMonthlyValue | null>, openingBalance: number | null) {
  let previous = openingBalance;
  return monthValues.map((value) => {
    if (value?.actualValue === null || value?.actualValue === undefined || previous === null || previous === undefined) {
      if (value?.actualValue !== null && value?.actualValue !== undefined) previous = value.actualValue;
      return null;
    }
    const delta = value.actualValue - previous;
    previous = value.actualValue;
    return delta;
  });
}

export function movingAverage3(values: Array<number | null>) {
  return values.map((_, index) => {
    const windowValues = values.slice(Math.max(0, index - 2), index + 1).filter((value): value is number => value !== null);
    if (!windowValues.length) return null;
    return windowValues.reduce((sum, value) => sum + value, 0) / windowValues.length;
  });
}

export function cashTargetStatus(ma3: number | null, targetValue: number | null | undefined) {
  if (ma3 === null || targetValue === null || targetValue === undefined) return null;
  return ma3 >= targetValue;
}
