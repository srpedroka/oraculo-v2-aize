import { CalendarCheck, ClipboardList, RefreshCcw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { StatusBadge } from "../components/ui/StatusBadge";
import { formatDate } from "../lib/format";
import { previousMonthPeriod } from "../lib/periods";
import { useAppState } from "../state/store";

export function Execution() {
  const { state, dispatch } = useAppState();
  const projects = state.strategicPlan?.projects ?? [];
  const rituals = state.strategicPlan?.rituals ?? [];
  const closePeriod = previousMonthPeriod();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-text-tertiary">Projetos, rituais e fechamento mensal</p>
        <h1 className="text-2xl font-semibold text-text">Execução Viva</h1>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-text-secondary" />
            <h2 className="text-base font-semibold text-text">Projetos prioritários</h2>
          </div>
          <div className="grid gap-3">
            {projects.length ? (
              projects.map((project) => (
                <div key={project.id} className="rounded-2xl border border-border bg-[#FAFAFB] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-text">{project.name}</p>
                      <p className="mt-1 text-sm text-text-secondary">Dono: {project.owner || "A definir"}</p>
                      <p className="mt-1 text-sm text-text-secondary">Prazo: {formatDate(project.deadline)}</p>
                    </div>
                    <StatusBadge status={project.status ?? "on_track"} />
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-border bg-[#FAFAFB] p-4 text-sm text-text-secondary">
                Nenhum projeto prioritário registrado no Plano Estratégico.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-text-secondary" />
            <h2 className="text-base font-semibold text-text">Rituais</h2>
          </div>
          <div className="space-y-2">
            {rituals.length ? (
              rituals.map((ritual) => (
                <p key={ritual} className="rounded-2xl border border-border bg-[#FAFAFB] px-4 py-3 text-sm text-text-secondary">
                  {ritual}
                </p>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-border bg-[#FAFAFB] p-4 text-sm text-text-secondary">
                Defina os rituais no Plano Estratégico.
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-text">Check-in mensal</h2>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              O Oráculo puxa os objetivos mensais por área, registra evidências e salva o resumo do mês.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 xl:grid-cols-2">
          {state.areas.length ? (
            state.areas.map((area) => {
              const monthlyObjectives = state.objectives.filter((objective) => objective.areaId === area.id && objective.level === "monthly" && objective.period === closePeriod);
              const lastCheckIn = state.checkIns.find((checkIn) => checkIn.areaId === area.id && checkIn.period === closePeriod);
              return (
                <div key={area.id} className="rounded-2xl border border-border bg-[#FAFAFB] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-text">{area.name}</p>
                      <p className="text-xs text-text-secondary">
                        {monthlyObjectives.length} objetivo mensal em {closePeriod} · Coordenador: {area.coordinator}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={RefreshCcw}
                      onClick={() => dispatch({ type: "start_session", sessionType: "month_close", areaId: area.id, period: closePeriod })}
                    >
                      Fechar mês
                    </Button>
                  </div>
                  {lastCheckIn ? (
                    <p className="mt-3 text-sm leading-6 text-text-secondary">{lastCheckIn.summary}</p>
                  ) : (
                    <p className="mt-3 text-sm leading-6 text-text-secondary">Nenhum check-in registrado ainda.</p>
                  )}
                </div>
              );
            })
          ) : (
            <p className="rounded-2xl border border-dashed border-border bg-[#FAFAFB] p-4 text-sm text-text-secondary">
              Crie áreas para liberar o check-in mensal.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
