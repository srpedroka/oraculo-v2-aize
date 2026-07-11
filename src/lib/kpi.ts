import type { ExecutiveKpi, KpiDirection, KpiMonthlyValue, KpiUnit, LadderStage } from "../types";

export const KPI_MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export const KPI_DASHBOARD_FRACTION_DIGITS = 2;
export const KPI_TOOLTIP_FRACTION_DIGITS = KPI_DASHBOARD_FRACTION_DIGITS + 2;

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

/** Formata número pt-BR com no máximo N casas; remove zeros finais via Intl. */
function formatPtNumber(value: number, maximumFractionDigits: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}

/**
 * Compacto executivo (cards/gráficos): mil / mi / bi.
 * Arredonda para a precisão solicitada; se o arredondamento atinge 1000 na unidade atual, sobe de escala
 * (ex.: 999_950 → "1 mi" em vez de "1.000 mil"). Percentual nunca abrevia.
 */
export function formatKpiCompact(
  value: number | null | undefined,
  unit: KpiUnit,
  options: { maximumFractionDigits?: number } = {},
) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const fractionDigits = Math.max(0, Math.min(6, Math.trunc(options.maximumFractionDigits ?? 1)));
  const roundingFactor = 10 ** fractionDigits;

  if (unit === "percent") {
    return `${formatPtNumber(value, fractionDigits)}%`;
  }

  const negative = value < 0;
  const abs = Math.abs(value);
  const sign = negative ? "-" : "";
  const money = unit === "currency";

  type Scale = { min: number; divisor: number; suffix: string };
  const scales: Scale[] = [
    { min: 1_000_000_000, divisor: 1_000_000_000, suffix: " bi" },
    { min: 1_000_000, divisor: 1_000_000, suffix: " mi" },
    { min: 1_000, divisor: 1_000, suffix: " mil" },
  ];

  let chosen: Scale | null = null;
  for (const scale of scales) {
    if (abs >= scale.min) {
      chosen = scale;
      break;
    }
  }

  // Promove se, na precisão pedida, o valor arredondado vira 1000 da unidade atual.
  if (chosen) {
    let scaled = abs / chosen.divisor;
    let rounded = Math.round(scaled * roundingFactor) / roundingFactor;
    if (rounded >= 1000) {
      if (chosen.suffix === " mil") {
        chosen = { min: 1_000_000, divisor: 1_000_000, suffix: " mi" };
        scaled = abs / chosen.divisor;
        rounded = Math.round(scaled * roundingFactor) / roundingFactor;
      } else if (chosen.suffix === " mi") {
        chosen = { min: 1_000_000_000, divisor: 1_000_000_000, suffix: " bi" };
        scaled = abs / chosen.divisor;
        rounded = Math.round(scaled * roundingFactor) / roundingFactor;
      }
    }
    const body = formatPtNumber(rounded, fractionDigits);
    if (money) return `${sign}R$ ${body}${chosen.suffix}`;
    return `${sign}${body}${chosen.suffix}`;
  }

  const body = formatPtNumber(abs, unit === "count" ? 0 : fractionDigits);
  if (money) return `${sign}R$ ${body}`;
  return `${sign}${body}`;
}

/** Valor integral para tooltip, acessibilidade e conferência (sem mil/mi/bi). */
export function formatKpiFull(value: number | null | undefined, unit: KpiUnit) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";

  if (unit === "percent") {
    return `${formatPtNumber(value, 1)}%`;
  }

  if (unit === "currency") {
    const negative = value < 0;
    const abs = Math.abs(value);
    const body = formatPtNumber(abs, 0);
    return `${negative ? "-" : ""}R$ ${body}`;
  }

  return formatPtNumber(value, unit === "count" ? 0 : 1);
}

/** Compat: `compact: true` usa formatKpiCompact; senão formatKpiFull. */
export function formatKpiValue(value: number | null | undefined, unit: KpiUnit, options: { compact?: boolean } = {}) {
  return options.compact ? formatKpiCompact(value, unit) : formatKpiFull(value, unit);
}

/** Casos canônicos da Fatia 2 — rodar `verifyKpiFormatCases()`. */
export const KPI_FORMAT_CASES: Array<{
  value: number | null;
  unit: KpiUnit;
  compact: string;
  full: string;
}> = [
  { value: 999, unit: "currency", compact: "R$ 999", full: "R$ 999" },
  { value: 1_000, unit: "currency", compact: "R$ 1 mil", full: "R$ 1.000" },
  { value: 1_250, unit: "currency", compact: "R$ 1,3 mil", full: "R$ 1.250" },
  // 999_999 arredonda para 1.000 mil → promove a 1 mi (regra documentada).
  { value: 999_999, unit: "currency", compact: "R$ 1 mi", full: "R$ 999.999" },
  { value: 1_200_000, unit: "currency", compact: "R$ 1,2 mi", full: "R$ 1.200.000" },
  { value: 2_400_000_000, unit: "currency", compact: "R$ 2,4 bi", full: "R$ 2.400.000.000" },
  { value: -1_250_000, unit: "currency", compact: "-R$ 1,3 mi", full: "-R$ 1.250.000" },
  { value: 12.45, unit: "percent", compact: "12,5%", full: "12,5%" },
  { value: null, unit: "currency", compact: "—", full: "—" },
  { value: 18_500, unit: "count", compact: "18,5 mil", full: "18.500" },
];

export function verifyKpiFormatCases() {
  const failures: string[] = [];
  for (const testCase of KPI_FORMAT_CASES) {
    const compact = formatKpiCompact(testCase.value, testCase.unit);
    const full = formatKpiFull(testCase.value, testCase.unit);
    if (compact !== testCase.compact) {
      failures.push(`compact(${testCase.value}, ${testCase.unit}): got "${compact}", want "${testCase.compact}"`);
    }
    if (full !== testCase.full) {
      failures.push(`full(${testCase.value}, ${testCase.unit}): got "${full}", want "${testCase.full}"`);
    }
  }
  if (failures.length) {
    throw new Error(`KPI format cases failed:\n${failures.join("\n")}`);
  }
  return true;
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

// --- Acumulado do ano (YTD) e projeção run-rate ---
// "Onde chego no ritmo atual", honesto por tipo de KPI: fluxo soma, margem faz
// média, caixa acumula geração. Sem forecast estatístico.

function finiteNumbers(values: Array<number | null | undefined>): number[] {
  return values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
}

export function closedMonths(monthValues: Array<KpiMonthlyValue | null>, upToMonth: number) {
  return finiteNumbers(monthValues.slice(0, upToMonth).map((value) => value?.actualValue)).length;
}

export function ytd(monthValues: Array<KpiMonthlyValue | null>, upToMonth: number, mode: "sum" | "average" = "sum") {
  const values = finiteNumbers(monthValues.slice(0, upToMonth).map((value) => value?.actualValue));
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return mode === "average" ? total / values.length : total;
}

export function ytdTargetTotal(monthValues: Array<KpiMonthlyValue | null>, upToMonth: number, mode: "sum" | "average" = "sum") {
  const values = finiteNumbers(monthValues.slice(0, upToMonth).map((value) => value?.targetValue));
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return mode === "average" ? total / values.length : total;
}

export function sumDeltas(deltas: Array<number | null>, upToMonth: number) {
  const values = finiteNumbers(deltas.slice(0, upToMonth));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

export function runRateProjection(ytdValue: number | null, closed: number) {
  if (ytdValue === null || closed <= 0) return null;
  return (ytdValue / closed) * 12;
}

export function onPace(projected: number | null, annualTarget: number | null | undefined, direction: KpiDirection) {
  if (projected === null || annualTarget === null || annualTarget === undefined || annualTarget === 0) return null;
  return direction === "lower_better" ? projected <= annualTarget * 1.02 : projected >= annualTarget * 0.98;
}
