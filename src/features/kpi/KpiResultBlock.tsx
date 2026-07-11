import { Activity, Banknote, Factory, History, Landmark, Link2, Pencil } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import {
  attainment,
  cashDeltas,
  cashTargetStatus,
  closedMonths,
  currentMonth,
  currentYear,
  formatAttainment,
  formatKpiCompact,
  formatKpiFull,
  KPI_MONTHS,
  ladderLabel,
  latestClosedKpiPeriod,
  movingAverage3,
  onPace,
  runRateProjection,
  sumDeltas,
  valuesForKpi,
  ytd,
} from "../../lib/kpi";
import { useAppState } from "../../state/store";
import type { ExecutiveKpi, KpiKey, KpiMonthlyValue, KpiUnit, Objective } from "../../types";
import { KpiSparkline } from "./KpiSparkline";

/** Número compacto com valor integral no title (tooltip nativo). */
function KpiAmount({ value, unit, className }: { value: number | null | undefined; unit: KpiUnit; className?: string }) {
  const compact = formatKpiCompact(value, unit);
  const full = formatKpiFull(value, unit);
  return (
    <span className={className} title={full === "—" ? undefined : full}>
      {compact}
    </span>
  );
}

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
  /** Abre o editor já varrendo documentos históricos em busca de números. */
  onRescueHistory?: () => void;
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

function paceTone(pace: boolean | null) {
  return pace === null ? "text-text-tertiary" : pace ? "text-status-success" : "text-status-danger";
}

function paceLabel(pace: boolean | null) {
  return pace === null ? "" : pace ? "no ritmo" : "abaixo do ritmo";
}

function clampPct(ratio: number) {
  if (!Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(100, ratio * 100));
}

function LinkedObjectives({ objectives }: { objectives: Objective[] }) {
  if (!objectives.length) return null;
  return (
    <div className="border-t border-border pt-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
        <Link2 className="h-3.5 w-3.5" /> Objetivos que podem impactar
      </div>
      <div className="mt-2 space-y-1">
        {objectives.slice(0, 3).map((objective) => (
          <p key={objective.id} className="truncate text-xs text-text">{objective.title}</p>
        ))}
        {objectives.length > 3 ? <p className="text-xs text-text-tertiary">+{objectives.length - 3} outros</p> : null}
      </div>
    </div>
  );
}

function KpiCard({ kpi, values, year, focusMonth, linkedObjectives }: { kpi: ExecutiveKpi; values: KpiMonthlyValue[]; year: number; focusMonth: number; linkedObjectives: Objective[] }) {
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
    const generationYtd = sumDeltas(deltas, focusMonth);
    const closed = closedMonths(monthValues, focusMonth);
    const cashActuals = monthValues
      .slice(0, focusMonth)
      .map((value) => value?.actualValue)
      .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
    const latestBalance = cashActuals.length ? cashActuals[cashActuals.length - 1] : null;
    const avgGeneration = generationYtd !== null && closed > 0 ? generationYtd / closed : null;
    const projectedBalance = latestBalance !== null && avgGeneration !== null ? latestBalance + avgGeneration * (12 - closed) : null;
    const cashPace = onPace(projectedBalance, kpi.annualTarget, kpi.direction);
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
            <p className="text-metric font-semibold text-text">
              <KpiAmount value={reportedAverage} unit="currency" />
            </p>
            <div className="mt-3 space-y-1 text-label text-text-secondary">
              <p>
                Saldo: <KpiAmount value={current?.actualValue} unit="currency" />
              </p>
              <p>
                Geração: <KpiAmount value={reportedDelta} unit="currency" />
              </p>
              <p>Estágio-alvo: {targetStage ?? "A definir"}</p>
            </div>
          </div>

          {generationYtd !== null ? (
            <div className="border-t border-border pt-3 text-label text-text-secondary">
              <p>
                Geração no ano: <KpiAmount value={generationYtd} unit="currency" className="font-medium text-text" />
              </p>
              {projectedBalance !== null ? (
                <p className="mt-1">
                  Projeção de saldo (dez): <KpiAmount value={projectedBalance} unit="currency" className="font-medium text-text" />
                  {cashPace !== null ? <span className={`ml-1 font-medium ${paceTone(cashPace)}`}>· {paceLabel(cashPace)}</span> : null}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-auto">
            <KpiSparkline data={sparklineData} showTarget={sparklineData.some((item) => item.target !== null)} />
          </div>
          <LinkedObjectives objectives={linkedObjectives} />
        </div>
      </Card>
    );
  }

  const attained = attainment(current?.actualValue, current?.targetValue, kpi.direction);
  const ytdMode = kpi.unit === "percent" ? "average" : "sum";
  const ytdValue = ytd(monthValues, focusMonth, ytdMode);
  const annual = kpi.annualTarget;
  const closed = closedMonths(monthValues, focusMonth);
  const projection = ytdMode === "sum" ? runRateProjection(ytdValue, closed) : ytdValue;
  const pace = onPace(projection, annual, kpi.direction);
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
          <p className="text-metric font-semibold text-text">
            <KpiAmount value={current?.actualValue} unit={kpi.unit} />
          </p>
          <div className="mt-3 space-y-1 text-label text-text-secondary">
            <p>
              Meta: <KpiAmount value={current?.targetValue} unit={kpi.unit} />
            </p>
            {kpi.secondaryUnit && current?.secondaryActual !== null && current?.secondaryActual !== undefined ? (
              <p>
                Qtd: <KpiAmount value={current.secondaryActual} unit={kpi.secondaryUnit} />
              </p>
            ) : null}
          </div>
        </div>

        {annual !== null && annual !== undefined && ytdValue !== null ? (
          <div className="border-t border-border pt-3">
            <div className="flex items-center justify-between gap-2 text-label">
              <span className="text-text-secondary">
                Ano{ytdMode === "average" ? " (média)" : ""}: <KpiAmount value={ytdValue} unit={kpi.unit} className="font-medium text-text" />
                <span className="text-text-tertiary">
                  {ytdMode === "sum" ? (
                    <>
                      {" "}
                      de <KpiAmount value={annual} unit={kpi.unit} />
                    </>
                  ) : (
                    <>
                      {" "}
                      · meta <KpiAmount value={annual} unit={kpi.unit} />
                    </>
                  )}
                </span>
              </span>
              {pace !== null ? <span className={`shrink-0 font-medium ${paceTone(pace)}`}>{paceLabel(pace)}</span> : null}
            </div>
            {ytdMode === "sum" ? (
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fill-active">
                <div className="h-full rounded-full bg-accent" style={{ width: `${clampPct(ytdValue / annual)}%` }} />
              </div>
            ) : null}
            {ytdMode === "sum" && projection !== null ? (
              <p className="mt-1 text-xs text-text-tertiary">
                Projeção do ano: <KpiAmount value={projection} unit={kpi.unit} />
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto">
          <KpiSparkline data={sparklineData} showTarget />
        </div>
        <LinkedObjectives objectives={linkedObjectives} />
      </div>
    </Card>
  );
}

export function KpiResultBlock({ kpis, values, canEdit = false, onEdit, onRescueHistory }: KpiResultBlockProps) {
  const { state } = useAppState();
  const { year, month: focusMonth } = latestClosedKpiPeriod();
  const currentPeriod = `${KPI_MONTHS[currentMonth() - 1]} ${currentYear()}`;
  const closedPeriod = `${KPI_MONTHS[focusMonth - 1]} ${year}`;
  const ordered = [...kpis].sort((left, right) => left.sortOrder - right.sortOrder);
  const hasPendingClose = ordered.some((kpi) => {
    const value = values.find((item) => item.kpiId === kpi.id && item.year === year && item.month === focusMonth);
    return value?.actualValue === null || value?.actualValue === undefined;
  });
  const historicalCount = state.planDocuments.filter((document) => document.origin === "historical" && !document.archivedAt).length;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Banknote className="h-5 w-5 text-[#9A6400]" />
            <h2 className="text-title-lg font-semibold text-text">Resultado</h2>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            {hasPendingClose ? `${closedPeriod} aguardando fechamento` : `Último mês fechado: ${closedPeriod}`} · {currentPeriod} em andamento
            {historicalCount ? ` · ${historicalCount} histórico(s) disponível(is) para resgate` : ""}
          </p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            {onRescueHistory ? (
              <Button variant="ghost" size="sm" icon={History} onClick={onRescueHistory} title="Lê documentos históricos e propõe lançamentos que ainda faltam">
                Resgatar do histórico
              </Button>
            ) : null}
            {onEdit ? (
              <Button variant="ghost" size="sm" icon={Pencil} onClick={onEdit}>
                Lançar / Editar
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {ordered.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {ordered.map((kpi) => (
            <KpiCard
              key={kpi.id}
              kpi={kpi}
              values={values}
              year={year}
              focusMonth={focusMonth}
              linkedObjectives={state.objectiveKpiLinks
                .filter((link) => link.kpiId === kpi.id)
                .map((link) => state.objectives.find((objective) => objective.id === link.objectiveId))
                .filter((objective): objective is Objective => Boolean(objective))}
            />
          ))}
        </div>
      ) : (
        <Card>
          <p className="text-base font-semibold text-text">KPIs executivos ainda não configurados</p>
          <p className="mt-2 text-sm leading-6 text-text-secondary">As quatro definições padrão entram automaticamente.</p>
        </Card>
      )}
    </section>
  );
}
