import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { CalendarCheck, Pencil, Plus, Sprout } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { AsyncDialogFallback } from "../components/AsyncDialogFallback";
import { Card } from "../components/ui/Card";
import { InlineFeedback } from "../components/ui/InlineFeedback";
import { ProgressBar } from "../components/ui/ProgressBar";
import { StatusBadge } from "../components/ui/StatusBadge";
import { Button } from "../components/ui/Button";
import { KpiResultBlock } from "../features/kpi/KpiResultBlock";
import { useSessionLauncher } from "../hooks/useSessionLauncher";
import { Link, useNavigate } from "react-router-dom";
import { previousMonthPeriod } from "../lib/periods";
import { buildTrackItems, displayStatus, summarize } from "../lib/execution";
import { formatObjectiveTarget } from "../lib/format";
import { useAppState } from "../state/store";
import type { Objective } from "../types";

const KpiEditorDialog = lazy(() => import("../features/kpi/KpiEditorDialog").then((module) => ({ default: module.KpiEditorDialog })));
const ObjectiveBuilder = lazy(() => import("../features/objective/ObjectiveBuilder").then((module) => ({ default: module.ObjectiveBuilder })));
const ObjectiveEditDialog = lazy(() => import("../features/objective/ObjectiveEditDialog").then((module) => ({ default: module.ObjectiveEditDialog })));

function canEditObjective(objective: Objective | undefined, state: ReturnType<typeof useAppState>["state"]) {
  if (!objective) return false;
  if (state.currentMembership?.role === "owner") return true;
  return Boolean(
    objective.areaId &&
      state.currentMembership?.role === "coordinator" &&
      state.areas.some((area) => area.id === objective.areaId && area.coordinatorId === state.currentMembership?.id),
  );
}

export function Dashboard() {
  const { state, dispatch } = useAppState();
  const navigate = useNavigate();
  const [editingObjective, setEditingObjective] = useState<Objective | null>(null);
  const [kpiEditorOpen, setKpiEditorOpen] = useState(false);
  const [kpiEditorScanHistory, setKpiEditorScanHistory] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const closePeriod = previousMonthPeriod();
  const sessionLauncher = useSessionLauncher(dispatch);
  const hasData = state.objectives.length > 0;
  const seedObjectives = state.objectives.filter((objective) => objective.type === "seed");
  const executiveSeeds = seedObjectives.filter((objective) => objective.level === "strategic");
  const activeSeeds = (executiveSeeds.length ? executiveSeeds : seedObjectives).filter((objective) => objective.status !== "done");
  const visibleEvolutionObjectives = activeSeeds.slice(0, 2);
  const onTrackSeeds = activeSeeds.filter((objective) => displayStatus(objective) === "on_track").length;
  const attentionSeeds = activeSeeds.filter((objective) => ["at_risk", "late"].includes(displayStatus(objective))).length;
  const unsetSeeds = activeSeeds.filter((objective) => displayStatus(objective) === "unset").length;
  const donutData = activeSeeds.length
    ? [
        { name: "No Prazo", value: onTrackSeeds, color: "#DDE7F3" },
        { name: "Em Risco", value: attentionSeeds, color: "#F2C28D" },
        { name: "Sem avaliação", value: unsetSeeds, color: "#ECECEF" },
      ].filter((item) => item.value > 0)
    : [{ name: "Sem dados", value: 1, color: "#ECECEF" }];
  const canCreateStrategicObjective = state.currentMembership?.role === "owner";
  const canEditDashboard = ["owner", "admin"].includes(state.currentMembership?.role ?? "");
  const pendingCloseAreas = state.areas.filter((area) => {
    const hasMonthlyPlan = state.objectives.some((objective) => objective.areaId === area.id && objective.level === "monthly" && objective.period === closePeriod);
    const hasCheckIn = state.checkIns.some((checkIn) => checkIn.areaId === area.id && checkIn.period === closePeriod);
    return hasMonthlyPlan && !hasCheckIn;
  });
  const execSummary = summarize(buildTrackItems(state.objectives, state.keyActions));
  const execOnTime = execSummary.onTimePct === null ? "—" : `${Math.round(execSummary.onTimePct * 100)}%`;

  return (
    <div className="mx-auto max-w-[820px] space-y-8">
      <div>
        <p className="text-sm font-medium text-text-tertiary">
          Visão geral da empresa
          {state.organization?.name ? ` · ${state.organization.name}` : ""}
        </p>
        <h1 className="text-2xl font-semibold text-text">Dashboard executivo</h1>
        <p className="mt-1 text-sm leading-6 text-text-secondary">Resultado, execução e pontos que pedem atenção agora.</p>
      </div>

      {sessionLauncher.error ? (
        <InlineFeedback
          tone="error"
          title={sessionLauncher.error.title}
          description={sessionLauncher.error.description}
          occurrenceId={sessionLauncher.error.occurrenceId}
          actionLabel="Tentar novamente"
          onAction={sessionLauncher.retry}
          actionLoading={sessionLauncher.pending}
        />
      ) : null}

      {execSummary.total ? (
        <Link
          to="/execucao"
          className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-muted"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-medium text-text">Execução</span>
            {execSummary.onTimePct === null ? (
              <span className="font-medium text-status-neutral">Sem prazos avaliáveis</span>
            ) : execSummary.late ? (
              <span className="font-semibold text-status-danger">
                {execSummary.late} atrasado{execSummary.late === 1 ? "" : "s"}
              </span>
            ) : (
              <span className="font-medium text-[#1D7A3E]">nada atrasado</span>
            )}
            {execSummary.onTimePct === null ? null : <span className="text-text-secondary tabular-nums">{execOnTime} no prazo</span>}
          </div>
          <span className="text-sm font-medium text-accent">Ver painel →</span>
        </Link>
      ) : null}

      {!hasData ? (
        <Card>
          <p className="text-base font-semibold text-text">A empresa está pronta para começar.</p>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Crie o Plano Estratégico e as áreas para o Oráculo mostrar Resultado e Evolução ao vivo.
          </p>
          <div className="mt-4">
            <Button icon={Plus} onClick={() => navigate("/estrategico")}>
              Criar Plano Estratégico
            </Button>
          </div>
        </Card>
      ) : null}

      {pendingCloseAreas.length ? (
        <Card className="border-[#D6D2CA] bg-[#FBFAF7]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-[560px]">
              <div className="flex items-center gap-2">
                <CalendarCheck className="h-5 w-5 text-[#7A6A45]" />
                <p className="text-base font-semibold text-text">Fechamento pendente · {closePeriod}</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Existe plano mensal encerrado sem fechamento. O Oráculo conduz status final, evidência, aprendizado e decisão das pendências.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {pendingCloseAreas.slice(0, 3).map((area) => (
                <Button
                  key={area.id}
                  variant="ghost"
                  size="sm"
                  icon={CalendarCheck}
                  loading={sessionLauncher.isStarting({ sessionType: "month_close", areaId: area.id, period: closePeriod })}
                  onClick={() => sessionLauncher.startSession({ sessionType: "month_close", areaId: area.id, period: closePeriod })}
                >
                  Fechar {area.name}
                </Button>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      <KpiResultBlock
        kpis={state.executiveKpis}
        values={state.kpiValues}
        canEdit={canEditDashboard}
        onEdit={() => {
          setKpiEditorScanHistory(false);
          setKpiEditorOpen(true);
        }}
        onRescueHistory={() => {
          setKpiEditorScanHistory(true);
          setKpiEditorOpen(true);
        }}
      />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Sprout className="h-5 w-5 text-[#9A6400]" />
          <h2 className="text-title-lg font-semibold text-text">Evolução</h2>
        </div>

        <div className="space-y-4">
          {visibleEvolutionObjectives.length ? (
            visibleEvolutionObjectives.map((objective) => (
              <Card key={objective.id}>
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-base font-medium text-text">{objective.title}</p>
                    <p className="mt-4 text-metric font-semibold text-text">{objective.progress ?? 0}%</p>
                    <p className="mt-3 text-body text-text-secondary">Meta: {formatObjectiveTarget(objective.target)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusBadge status={displayStatus(objective)} />
                    {canEditObjective(objective, state) ? (
                      <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditingObjective(objective)}>
                        Editar
                      </Button>
                    ) : null}
                  </div>
                </div>
                <ProgressBar value={objective.progress ?? 0} />
              </Card>
            ))
          ) : (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-base font-medium text-text">Nenhum objetivo de Evolução cadastrado</p>
                  <p className="mt-3 text-body text-text-secondary">O próximo jogo ainda precisa de um objetivo próprio.</p>
                </div>
                {canCreateStrategicObjective ? (
                  <Button variant="ghost" size="sm" icon={Plus} onClick={() => setBuilderOpen(true)}>
                    Criar
                  </Button>
                ) : null}
              </div>
            </Card>
          )}

          {activeSeeds.length ? (
            <Card>
              <div className="grid grid-cols-[1fr_112px] items-center gap-4">
                <div>
                  <p className="text-base font-medium text-text">Objetivos de Evolução</p>
                  <p className="mt-4 text-metric font-semibold text-text">{activeSeeds.length} Em Andamento</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="text-body text-text-secondary">{onTrackSeeds} No Prazo</span>
                    {attentionSeeds ? (
                      <span className="rounded-control bg-status-warning-bg px-3 py-1.5 text-sm font-medium text-status-warning">
                        {attentionSeeds} Em Risco
                      </span>
                    ) : null}
                    {unsetSeeds ? <span className="text-body text-status-neutral">{unsetSeeds} Sem avaliação</span> : null}
                  </div>
                </div>
                <div className="h-28 w-28" aria-hidden="true">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="value"
                        innerRadius={34}
                        outerRadius={50}
                        paddingAngle={3}
                        isAnimationActive={false}
                        rootTabIndex={-1}
                      >
                        {donutData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} stroke="#CCD4DE" />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>
          ) : null}
        </div>
      </section>
      {editingObjective ? (
        <Suspense fallback={<AsyncDialogFallback label="Abrindo objetivo..." />}>
          <ObjectiveEditDialog objective={editingObjective} onClose={() => setEditingObjective(null)} />
        </Suspense>
      ) : null}
      {kpiEditorOpen ? (
        <Suspense fallback={<AsyncDialogFallback label="Abrindo lançamentos..." />}>
          <KpiEditorDialog
            autoScanHistory={kpiEditorScanHistory}
            onClose={() => {
              setKpiEditorOpen(false);
              setKpiEditorScanHistory(false);
            }}
          />
        </Suspense>
      ) : null}
      {builderOpen ? (
        <Suspense fallback={<AsyncDialogFallback label="Abrindo novo objetivo..." />}>
          <ObjectiveBuilder level="strategic" onClose={() => setBuilderOpen(false)} />
        </Suspense>
      ) : null}
    </div>
  );
}
