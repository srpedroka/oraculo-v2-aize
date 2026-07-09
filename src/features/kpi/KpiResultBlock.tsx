import { Activity, Banknote, Factory, Landmark, Pencil } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import {
  attainment,
  cashDeltas,
  cashTargetStatus,
  currentMonth,
  currentYear,
  formatAttainment,
  formatKpiValue,
  KPI_MONTHS,
  ladderLabel,
  latestClosedKpiPeriod,
  movingAverage3,
  valuesForKpi,
} from "../../lib/kpi";
import type { ExecutiveKpi, KpiKey, KpiMonthlyValue } from "../../types";
import { KpiSparkline } from "./KpiSparkline";

const KPI_ICON = {
  revenue: Banknote,
  operating_margin: Activity,
  production: Factory,
  cash: Landmark,
} satisfies Record<KpiKey, typeof Banknote>;

interface KpiResultBlockProps {
  kpis: ExecutiveKpi[];
  values: KpiMonthlyValue[];
  canEdit?: boolean;
  onEdit?: () => void;
}

function badgeClass(value: number | null) {
  if (value === null) return "bg-fill-active text-text-secondary";
  if (value >= 1) return "bg-status-success-bg text-status-success";
  if (value >= 0.8) return "bg-status-warning-bg text-status-warning";
  return "bg-status-danger-bg text-status-danger";
}

function cashBadgeClass(status: boolean | null, ma3: number | null) {
  if (status === true) return "bg-status-success-bg text-status-success";
  if (status === false) return "bg-status-danger-bg text-status-danger";
  if (ma3 !== null && ma3 >= 0) return "bg-status-success-bg text-status-success";
  if (ma3 !== null) return "bg-status-danger-bg text-status-danger";
  return "bg-fill-active text-text-secondary";
}

function KpiCard({ kpi, values, year, focusMonth }: { kpi: ExecutiveKpi; values: KpiMonthlyValue[]; year: number; focusMonth: number }) {
  const Icon = KPI_ICON[kpi.key];
  const monthValues = valuesForKpi(values, kpi, year);
  const current = monthValues[focusMonth - 1];
  const hasActual = current?.actualValue !== null && current?.actualValue !== undefined;

  if (kpi.key === "cash") {
    const deltas = cashDeltas(monthValues, kpi.openingBalance);
    const averages = movingAverage3(deltas);
    const currentDelta = deltas[focusMonth - 1];
    const currentAverage = averages[focusMonth - 1];
    const reportedDelta = hasActual ? currentDelta : null;
    const reportedAverage = hasActual ? currentAverage : null;
    const targetStage = ladderLabel(kpi.ladder, current?.targetStage);
    const targetMet = cashTargetStatus(reportedAverage, current?.targetValue);
    const sparklineData = KPI_MONTHS.map((month, index) => ({
      month,
      actual: deltas[index],
      target: monthValues[index]?.targetValue ?? null,
    }));

    return (
      <Card>
        <div className="flex h-full flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-[#7A6A45]" />
                <p className="truncate text-body font-semibold text-text">{kpi.label}</p>
              </div>
              <p className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-text-tertiary">{KPI_MONTHS[focusMonth - 1]} {year}</p>
            </div>
            <span className={`shrink-0 rounded-control px-2.5 py-1 text-sm font-medium ${cashBadgeClass(targetMet, reportedAverage)}`}>
              {!hasActual ? "A fechar" : targetMet === null ? (reportedAverage === null ? "—" : reportedAverage >= 0 ? "Positivo" : "Negativo") : targetMet ? "Meta OK" : "Abaixo"}
            </span>
          </div>

          <div>
            <p className="text-metric font-semibold text-text">{formatKpiValue(reportedAverage, "currency", { compact: true })}</p>
            <div className="mt-3 space-y-1 text-label text-text-secondary">
              <p>Saldo: {formatKpiValue(current?.actualValue, "currency", { compact: true })}</p>
              <p>Geração: {formatKpiValue(reportedDelta, "currency", { compact: true })}</p>
              <p>Estágio-alvo: {targetStage ?? "A definir"}</p>
            </div>
          </div>

          <div className="mt-auto">
            <KpiSparkline data={sparklineData} showTarget={sparklineData.some((item) => item.target !== null)} />
          </div>
        </div>
      </Card>
    );
  }

  const attained = attainment(current?.actualValue, current?.targetValue, kpi.direction);
  const sparklineData = KPI_MONTHS.map((month, index) => ({
    month,
    actual: monthValues[index]?.actualValue ?? null,
    target: monthValues[index]?.targetValue ?? null,
  }));

  return (
    <Card>
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 shrink-0 text-[#7A6A45]" />
              <p className="truncate text-body font-semibold text-text">{kpi.label}</p>
            </div>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-text-tertiary">{KPI_MONTHS[focusMonth - 1]} {year}</p>
          </div>
          <span className={`shrink-0 rounded-control px-2.5 py-1 text-sm font-medium ${badgeClass(attained)}`}>{hasActual ? formatAttainment(attained) : "A fechar"}</span>
        </div>

        <div>
          <p className="text-metric font-semibold text-text">{formatKpiValue(current?.actualValue, kpi.unit, { compact: true })}</p>
          <div className="mt-3 space-y-1 text-label text-text-secondary">
            <p>Meta: {formatKpiValue(current?.targetValue, kpi.unit, { compact: true })}</p>
            {kpi.secondaryUnit && current?.secondaryActual !== null && current?.secondaryActual !== undefined ? (
              <p>Qtd: {formatKpiValue(current.secondaryActual, kpi.secondaryUnit, { compact: true })}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-auto">
          <KpiSparkline data={sparklineData} showTarget />
        </div>
      </div>
    </Card>
  );
}

export function KpiResultBlock({ kpis, values, canEdit = false, onEdit }: KpiResultBlockProps) {
  const { year, month: focusMonth } = latestClosedKpiPeriod();
  const currentPeriod = `${KPI_MONTHS[currentMonth() - 1]} ${currentYear()}`;
  const closedPeriod = `${KPI_MONTHS[focusMonth - 1]} ${year}`;
  const ordered = [...kpis].sort((left, right) => left.sortOrder - right.sortOrder);
  const hasPendingClose = ordered.some((kpi) => {
    const value = values.find((item) => item.kpiId === kpi.id && item.year === year && item.month === focusMonth);
    return value?.actualValue === null || value?.actualValue === undefined;
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Banknote className="h-5 w-5 text-[#9A6400]" />
            <h2 className="text-title-lg font-semibold text-text">Resultado</h2>
            <span className="text-[18px] text-text-secondary">(Jogo Atual)</span>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            {hasPendingClose ? `${closedPeriod} aguardando fechamento` : `Último mês fechado: ${closedPeriod}`} · {currentPeriod} em andamento
          </p>
        </div>
        {canEdit && onEdit ? (
          <Button variant="ghost" size="sm" icon={Pencil} onClick={onEdit}>
            Lançar / Editar
          </Button>
        ) : null}
      </div>

      {ordered.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {ordered.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} values={values} year={year} focusMonth={focusMonth} />
          ))}
        </div>
      ) : (
        <Card>
          <p className="text-base font-semibold text-text">KPIs executivos ainda não configurados</p>
          <p className="mt-2 text-sm leading-6 text-text-secondary">As quatro definições padrão entram automaticamente quando a migration é aplicada.</p>
        </Card>
      )}
    </section>
  );
}
