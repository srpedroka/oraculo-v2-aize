import { ArrowLeft, FileText, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ObjectiveBuilder } from "../features/objective/ObjectiveBuilder";
import { ObjectiveCard } from "../features/objective/ObjectiveCard";
import { currentMonthPeriod, currentQuarterPeriod } from "../lib/periods";
import { useAppState } from "../state/store";
import type { PlanLevel } from "../types";

type AreaTab = "area_annual" | "quarterly" | "monthly";

const TAB_LABEL: Record<AreaTab, string> = {
  area_annual: "Anual da Área",
  quarterly: "Trimestral",
  monthly: "Mensal",
};

function BulletList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-text-tertiary">{title}</p>
      <ul className="space-y-1 text-sm leading-6 text-text-secondary">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function AreaDetail() {
  const { areaId } = useParams();
  const { state, dispatch } = useAppState();
  const [tab, setTab] = useState<AreaTab>("quarterly");
  const [builderLevel, setBuilderLevel] = useState<PlanLevel | null>(null);
  const area = state.areas.find((item) => item.id === areaId);
  const plan = state.areaPlans.find((item) => item.areaId === areaId);
  const canEditArea = Boolean(
    area &&
      (state.currentMembership?.role === "owner" ||
        (state.currentMembership?.role === "coordinator" && area.coordinatorId === state.currentMembership?.id)),
  );

  const objectives = useMemo(
    () =>
      state.objectives.filter((objective) => objective.areaId === areaId && objective.level === tab),
    [areaId, state.objectives, tab],
  );

  function startQuarterlySession() {
    if (!area) return;
    dispatch({ type: "start_session", sessionType: "quarterly", areaId: area.id, period: currentQuarterPeriod() });
  }

  function startMonthlySession() {
    if (!area) return;
    dispatch({ type: "start_session", sessionType: "monthly", areaId: area.id, period: currentMonthPeriod() });
  }

  function startSessionForCurrentTab() {
    if (tab === "monthly") startMonthlySession();
    else startQuarterlySession();
  }

  if (!area) return <Navigate to="/areas" replace />;

  if (!plan) {
    return (
      <div className="space-y-6">
        <div>
          <Link to="/areas" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-accent">
            <ArrowLeft className="h-4 w-4" />
            Áreas
          </Link>
          <p className="text-sm font-medium text-text-tertiary">Coordenador: {area.coordinator}</p>
          <h1 className="text-2xl font-semibold text-text">Área: {area.name}</h1>
        </div>
        <Card>
          <p className="text-base font-semibold text-text">Nenhum plano anual da área ainda.</p>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Crie a base anual para depois desdobrar objetivos trimestrais e mensais.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {canEditArea ? (
              <Button variant="ghost" icon={Plus} onClick={() => setBuilderLevel("area_annual")}>
                Criar objetivo anual
              </Button>
            ) : null}
            <Button icon={Plus} onClick={startQuarterlySession}>
              Planejar com o Oráculo
            </Button>
          </div>
        </Card>
        {builderLevel ? <ObjectiveBuilder level={builderLevel} areaId={area.id} onClose={() => setBuilderLevel(null)} /> : null}
      </div>
    );
  }

  const linkedStrategicObjectives = plan.linkedStrategicObjectiveIds
    .map((id) => state.objectives.find((objective) => objective.id === id))
    .filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/areas" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-accent">
            <ArrowLeft className="h-4 w-4" />
            Áreas
          </Link>
          <p className="text-sm font-medium text-text-tertiary">Coordenador: {area.coordinator}</p>
          <h1 className="text-2xl font-semibold text-text">Área: {area.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/documentos"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-border bg-transparent px-4 text-sm font-medium text-text transition hover:border-accent/30 hover:bg-white"
          >
            <FileText className="h-4 w-4" />
            Ver documentos
          </Link>
          {canEditArea ? (
            <Button variant="ghost" icon={Plus} onClick={() => setBuilderLevel(tab)}>
              Novo objetivo
            </Button>
          ) : null}
          {tab !== "area_annual" ? (
            <Button icon={Plus} onClick={startSessionForCurrentTab}>
              {tab === "monthly" ? "Planejar o mês com o Oráculo" : "Planejar o trimestre com o Oráculo"}
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <p className="mb-2 text-xs font-medium text-text-tertiary">Papel da área</p>
            <p className="text-sm font-semibold leading-6 text-text">{plan.role.mission}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {plan.role.contribution.map((item) => (
                <span key={item} className="rounded-[10px] bg-[#F0F0F2] px-2.5 py-1 text-xs font-medium text-text-secondary">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-text-tertiary">Alinhamento</p>
            <div className="space-y-2">
              {linkedStrategicObjectives.map((objective) => (
                <p key={objective!.id} className="text-sm leading-6 text-text-secondary">
                  {objective!.title}
                </p>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <BulletList title="Forças" items={plan.diagnosis.strengths} />
            <BulletList title="Fraquezas" items={plan.diagnosis.weaknesses} />
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-border bg-surface p-1 shadow-card">
          {(Object.keys(TAB_LABEL) as AreaTab[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={[
                "rounded-[10px] px-4 py-2 text-sm font-medium transition",
                tab === item ? "bg-[#F0F7FF] text-accent" : "text-text-secondary hover:text-text",
              ].join(" ")}
            >
              {TAB_LABEL[item]}
            </button>
          ))}
        </div>
      </div>

      {tab === "quarterly" ? (
        <Card>
          <p className="text-xs font-medium text-text-tertiary">Foco de aprendizado · Q3 2026</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {plan.learningFocus.q3.length ? (
              plan.learningFocus.q3.map((item) => (
                <span key={item} className="rounded-[10px] bg-[#F0F7FF] px-2.5 py-1 text-xs font-medium text-accent">
                  {item}
                </span>
              ))
            ) : (
              <span className="text-sm text-text-secondary">Sem foco definido para o trimestre vigente.</span>
            )}
          </div>
        </Card>
      ) : null}

      <section className="space-y-4">
        {objectives.length ? (
          objectives.map((objective) => {
            const parent = state.objectives.find((item) => item.id === objective.parentId);
            const actions = state.keyActions.filter((action) => action.objectiveId === objective.id);
            return (
              <ObjectiveCard
                key={objective.id}
                objective={objective}
                parent={parent}
                keyActions={actions}
                highlighted={objective.id === plan.mainAnnualObjectiveId}
              />
            );
          })
        ) : (
          <Card className="text-center">
            <p className="text-base font-semibold text-text">Nenhum objetivo {TAB_LABEL[tab].toLowerCase()} ainda.</p>
            <p className="mt-2 text-sm text-text-secondary">Crie o primeiro manualmente ou com o Oráculo quando a condução estiver disponível para este nível.</p>
            <div className="mt-4">
              <div className="flex flex-wrap justify-center gap-2">
                {canEditArea ? (
                  <Button variant="ghost" icon={Plus} onClick={() => setBuilderLevel(tab)}>
                    Criar objetivo
                  </Button>
                ) : null}
                {tab !== "area_annual" ? (
                  <Button icon={Plus} onClick={tab === "monthly" ? startMonthlySession : startQuarterlySession}>
                    {tab === "monthly" ? "Planejar o mês com o Oráculo" : "Planejar o trimestre com o Oráculo"}
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
        )}
      </section>

      {builderLevel ? <ObjectiveBuilder level={builderLevel} areaId={area.id} onClose={() => setBuilderLevel(null)} /> : null}
    </div>
  );
}
