import { Link } from "react-router-dom";
import { ArrowRight, Waypoints } from "lucide-react";
import { Card } from "../components/ui/Card";
import { StatusBadge } from "../components/ui/StatusBadge";
import { ObjectiveCard } from "../features/objective/ObjectiveCard";
import { useAppState } from "../state/store";
import type { Status } from "../types";

export function QuarterlyPlans() {
  const { state } = useAppState();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text-tertiary">Planejamento da execução · Q3 2026</p>
          <h1 className="text-2xl font-semibold text-text">Planos Trimestrais</h1>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary shadow-card">
          <Waypoints className="h-4 w-4" />
          Trimestre vigente
        </div>
      </div>

      <div className="space-y-5">
        {state.areas.map((area) => {
          const plan = state.areaPlans.find((item) => item.areaId === area.id);
          const quarterlyObjectives = state.objectives.filter(
            (objective) => objective.areaId === area.id && objective.level === "quarterly" && objective.period === "Q3 2026",
          );
          const annualObjectives = state.objectives.filter(
            (objective) => objective.areaId === area.id && objective.level === "area_annual",
          );
          const counts = quarterlyObjectives.reduce<Record<Status, number>>(
            (acc, objective) => ({ ...acc, [objective.status]: acc[objective.status] + 1 }),
            { on_track: 0, at_risk: 0, late: 0, done: 0 },
          );

          return (
            <Card key={area.id} className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-text-tertiary">Área</p>
                  <h2 className="mt-1 text-lg font-semibold text-text">{area.name}</h2>
                  <p className="mt-1 text-sm text-text-secondary">Coordenador: {area.coordinator}</p>
                </div>
                <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                  {counts.on_track ? <StatusBadge status="on_track" /> : null}
                  {counts.at_risk ? <StatusBadge status="at_risk" /> : null}
                  {counts.late ? <StatusBadge status="late" /> : null}
                  {counts.done ? <StatusBadge status="done" /> : null}
                  <Link
                    to={`/areas/${area.id}`}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[10px] border border-border bg-transparent px-3 text-[13px] font-medium text-text transition hover:border-accent/30 hover:bg-white"
                  >
                    <ArrowRight className="h-4 w-4" />
                    Abrir área
                  </Link>
                </div>
              </div>

              {plan ? (
                <div className="grid gap-3 rounded-2xl border border-border bg-[#FAFAFB] p-4 lg:grid-cols-[1fr_1fr]">
                  <div>
                    <p className="text-xs font-medium text-text-tertiary">Papel no ano</p>
                    <p className="mt-1 text-sm leading-6 text-text-secondary">{plan.role.mission}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-text-tertiary">Objetivo anual de origem</p>
                    <div className="mt-1 space-y-1">
                      {annualObjectives.map((objective) => (
                        <p key={objective.id} className="text-sm leading-6 text-text-secondary">
                          {objective.title}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4">
                {quarterlyObjectives.length ? (
                  quarterlyObjectives.map((objective) => {
                    const parent = state.objectives.find((item) => item.id === objective.parentId);
                    return <ObjectiveCard key={objective.id} objective={objective} parent={parent} />;
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-[#FAFAFB] p-5 text-sm text-text-secondary">
                    Nenhum objetivo trimestral definido para esta área.
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
