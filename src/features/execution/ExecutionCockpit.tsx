import { AlertTriangle, CheckCircle2, GaugeCircle, Users } from "lucide-react";
import { useMemo } from "react";
import { Card } from "../../components/ui/Card";
import { formatDate } from "../../lib/format";
import { buildTrackItems, daysLate, groupByOwner, overdueItems, summarize } from "../../lib/execution";
import { useAppState } from "../../state/store";

function pct(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function pctTone(value: number | null) {
  if (value === null) return "text-text-tertiary";
  if (value >= 0.85) return "text-[#1D7A3E]";
  if (value >= 0.6) return "text-[#B7791F]";
  return "text-status-danger";
}

export function ExecutionCockpit() {
  const { state } = useAppState();

  const items = useMemo(() => buildTrackItems(state.objectives, state.keyActions), [state.objectives, state.keyActions]);

  const summary = useMemo(() => summarize(items), [items]);
  const overdue = useMemo(() => overdueItems(items), [items]);
  const owners = useMemo(() => groupByOwner(items), [items]);

  const areaName = (areaId: string | null) => state.areas.find((area) => area.id === areaId)?.name ?? "Empresa";

  if (!items.length) {
    return (
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <GaugeCircle className="h-5 w-5 text-text-secondary" />
          <h2 className="text-base font-semibold text-text">Painel de execução</h2>
        </div>
        <p className="text-sm leading-6 text-text-secondary">
          Sem compromissos com prazo para acompanhar ainda. Crie planos mensais com ações-chave, donos e prazos para o
          painel mostrar o que está no prazo e o que atrasou.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <GaugeCircle className="h-5 w-5 text-text-secondary" />
        <h2 className="text-base font-semibold text-text">Painel de execução</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-control border border-border bg-surface-muted px-4 py-3">
          <p className="text-xs font-medium text-text-tertiary">No prazo</p>
          <p className={["mt-1 text-2xl font-semibold tabular-nums", pctTone(summary.onTimePct)].join(" ")}>{pct(summary.onTimePct)}</p>
          <p className="mt-0.5 text-xs text-text-tertiary">{summary.withDeadline} com prazo</p>
        </div>
        <div className="rounded-control border border-status-danger/30 bg-status-danger-bg px-4 py-3">
          <p className="text-xs font-medium text-status-danger">Atrasados</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-status-danger">{summary.late}</p>
          <p className="mt-0.5 text-xs text-text-tertiary">venceram sem concluir</p>
        </div>
        <div className="rounded-control border border-border bg-surface-muted px-4 py-3">
          <p className="text-xs font-medium text-text-tertiary">Em risco</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[#B7791F]">{summary.atRisk}</p>
          <p className="mt-0.5 text-xs text-text-tertiary">marcados como risco</p>
        </div>
        <div className="rounded-control border border-border bg-surface-muted px-4 py-3">
          <p className="text-xs font-medium text-text-tertiary">Concluídos</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[#1D7A3E]">{summary.done}</p>
          <p className="mt-0.5 text-xs text-text-tertiary">de {summary.total} no total</p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-status-danger" />
            <h3 className="text-sm font-semibold text-text">Atrasados</h3>
          </div>
          {overdue.length ? (
            <div className="divide-y divide-border overflow-hidden rounded-control border border-border">
              {overdue.slice(0, 8).map((item) => {
                const late = daysLate(item.deadline) ?? 0;
                return (
                  <div key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text">{item.title}</p>
                      <p className="truncate text-xs text-text-tertiary">
                        {areaName(item.areaId)} · {item.owner?.trim() || "Sem responsável"} · venceu {formatDate(item.deadline)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-status-danger-bg px-2.5 py-1 text-xs font-semibold text-status-danger tabular-nums">
                      {late} {late === 1 ? "dia" : "dias"}
                    </span>
                  </div>
                );
              })}
              {overdue.length > 8 ? (
                <p className="px-4 py-2 text-xs text-text-tertiary">+{overdue.length - 8} outros atrasados</p>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-control border border-border bg-surface-muted px-4 py-3">
              <CheckCircle2 className="h-4 w-4 text-[#1D7A3E]" />
              <p className="text-sm text-text-secondary">Nada atrasado. Todos os prazos em dia.</p>
            </div>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2">
            <Users className="h-4 w-4 text-text-secondary" />
            <h3 className="text-sm font-semibold text-text">Por responsável</h3>
          </div>
          <div className="divide-y divide-border overflow-hidden rounded-control border border-border">
            {owners.slice(0, 6).map((group) => (
              <div key={group.owner} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <p className="min-w-0 truncate text-sm text-text">{group.owner}</p>
                <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums">
                  {group.late ? (
                    <span className="font-semibold text-status-danger">{group.late} atrasado{group.late === 1 ? "" : "s"}</span>
                  ) : (
                    <span className="text-text-tertiary">em dia</span>
                  )}
                  <span className={pctTone(group.onTimePct)}>{pct(group.onTimePct)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Card>
  );
}
