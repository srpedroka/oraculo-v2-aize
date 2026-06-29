import { ArrowRight, CalendarRange } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { StatusBadge } from "../components/ui/StatusBadge";
import { useAppState } from "../state/store";
import type { PlanLevel, Status } from "../types";

function levelCount(level: PlanLevel, count: number) {
  const label =
    level === "area_annual"
      ? "Anual"
      : level === "quarterly"
        ? "Trimestral"
        : level === "monthly"
          ? "Mensal"
          : "Estratégico";
  return `${count} ${label}`;
}

export function Areas() {
  const { state } = useAppState();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-text-tertiary">Departamentos da {state.organization?.name}</p>
        <h1 className="text-2xl font-semibold text-text">Departamentos</h1>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {!state.areas.length ? (
          <Card className="xl:col-span-2">
            <p className="text-base font-semibold text-text">Nenhum departamento cadastrado.</p>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Vá em Configurações para criar departamentos e vincular coordenadores.
            </p>
          </Card>
        ) : null}
        {state.areas.map((area) => {
          const plan = state.areaPlans.find((item) => item.areaId === area.id);
          const areaObjectives = state.objectives.filter((objective) => objective.areaId === area.id);
          const executionObjectives = areaObjectives.filter((objective) => ["quarterly", "monthly"].includes(objective.level));
          const counts = executionObjectives.reduce<Record<Status, number>>(
            (acc, objective) => ({ ...acc, [objective.status]: acc[objective.status] + 1 }),
            { on_track: 0, at_risk: 0, late: 0, done: 0 },
          );
          const annualCount = areaObjectives.filter((objective) => objective.level === "area_annual").length;
          const quarterlyCount = areaObjectives.filter((objective) => objective.level === "quarterly").length;
          const monthlyCount = areaObjectives.filter((objective) => objective.level === "monthly").length;
          const linkedStrategic = plan?.linkedStrategicObjectiveIds
            .map((id) => state.objectives.find((objective) => objective.id === id)?.title)
            .filter(Boolean);

          return (
            <Card key={area.id} interactive className="flex h-full flex-col gap-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-text-tertiary">Departamento</p>
                  <h2 className="mt-1 text-lg font-semibold text-text">{area.name}</h2>
                  <p className="mt-1 text-sm text-text-secondary">Coordenador: {area.coordinator}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {counts.on_track ? <StatusBadge status="on_track" /> : null}
                  {counts.at_risk ? <StatusBadge status="at_risk" /> : null}
                  {counts.late ? <StatusBadge status="late" /> : null}
                  {counts.done ? <StatusBadge status="done" /> : null}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-[#FAFAFB] p-4">
                <p className="text-xs font-medium text-text-tertiary">Papel do departamento</p>
                <p className="mt-1 text-sm leading-6 text-text-secondary">{plan?.role.mission}</p>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-text-tertiary">Puxa da estratégia</p>
                <div className="flex flex-wrap gap-2">
                  {linkedStrategic?.map((title) => (
                    <span key={title} className="rounded-[10px] bg-[#F0F0F2] px-2.5 py-1 text-xs font-medium text-text-secondary">
                      {title}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-[10px] bg-[#F0F7FF] px-2.5 py-1 text-xs font-medium text-accent">
                  {levelCount("area_annual", annualCount)}
                </span>
                <span className="rounded-[10px] bg-[#F0F7FF] px-2.5 py-1 text-xs font-medium text-accent">
                  {levelCount("quarterly", quarterlyCount)}
                </span>
                <span className="rounded-[10px] bg-[#F0F7FF] px-2.5 py-1 text-xs font-medium text-accent">
                  {levelCount("monthly", monthlyCount)}
                </span>
              </div>

              <div className="mt-auto flex flex-wrap gap-2">
                <Link
                  to={`/departamentos/${area.id}`}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-accent bg-accent px-4 text-sm font-medium text-white transition hover:bg-[#0066CC]"
                >
                  Abrir departamento
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/planos-trimestrais"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-border bg-transparent px-4 text-sm font-medium text-text transition hover:border-accent/30 hover:bg-white"
                >
                  <CalendarRange className="h-4 w-4" />
                  Ver trimestral
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
