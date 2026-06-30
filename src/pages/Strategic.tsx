import { ClipboardCheck, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { LineageTag } from "../components/ui/LineageTag";
import { ObjectiveBuilder } from "../features/objective/ObjectiveBuilder";
import { ObjectiveCard } from "../features/objective/ObjectiveCard";
import { formatDate } from "../lib/format";
import { reviewPastedPlan, type PastedPlanReview } from "../lib/oracle";
import { useAppState } from "../state/store";

type StrategicTab = "build" | "paste";

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <p className="mb-3 text-sm font-semibold text-text">{title}</p>
      <ul className="space-y-2 text-sm leading-6 text-text-secondary">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Card>
  );
}

function ReviewResult({ review }: { review: PastedPlanReview }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <p className="mb-3 text-sm font-semibold text-text">O que está concreto</p>
        {review.concrete.length ? (
          <ul className="space-y-2 text-sm leading-6 text-text-secondary">
            {review.concrete.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">Ainda não apareceu objetivo com sinais suficientes.</p>
        )}
      </Card>
      <Card>
        <p className="mb-3 text-sm font-semibold text-text">O que está genérico</p>
        {review.generic.length ? (
          <ul className="space-y-2 text-sm leading-6 text-text-secondary">
            {review.generic.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">Não encontrei frases totalmente sem sinal de concretude.</p>
        )}
      </Card>
      <Card>
        <p className="mb-3 text-sm font-semibold text-text">O que falta no conjunto</p>
        <ul className="space-y-2 text-sm leading-6 text-text-secondary">
          {review.missing.map((item) => (
            <li key={item}>{item}</li>
          ))}
          {!review.missing.length ? <li>O conjunto já tem boa base para virar plano estruturado.</li> : null}
        </ul>
      </Card>
    </div>
  );
}

export function Strategic() {
  const { state, dispatch } = useAppState();
  const [tab, setTab] = useState<StrategicTab>("build");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [pastedPlan, setPastedPlan] = useState("");
  const [review, setReview] = useState<PastedPlanReview | null>(null);
  const plan = state.strategicPlan;
  const strategicObjectives = useMemo(
    () => state.objectives.filter((objective) => objective.level === "strategic"),
    [state.objectives],
  );

  if (!plan) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-text-tertiary">Planejamento anual da empresa</p>
          <h1 className="text-2xl font-semibold text-text">Plano Estratégico</h1>
        </div>
        <Card>
          <p className="text-base font-semibold text-text">Nenhum Plano Estratégico ainda.</p>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Crie a estrutura anual para começar a desdobrar objetivos por área, trimestre e mês.
          </p>
          <div className="mt-4">
            <Button
              icon={Plus}
              onClick={() =>
                dispatch({
                  type: "update_strategic_plan",
                  plan: {
                    id: "draft-strategic-plan",
                    orgId: state.activeOrgId ?? "",
                    year: 2026,
                    profile: { sector: "", size: "", region: "", founded: "", mainPain: "" },
                    drivers: { purpose: "", vision: "", values: [] },
                    swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
                    themes: [],
                    projects: [],
                    rituals: [],
                    executiveSummary: "",
                  },
                })
              }
            >
              Criar plano 2026
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text-tertiary">Planejamento anual da empresa · {plan.year}</p>
          <h1 className="text-2xl font-semibold text-text">Plano Estratégico</h1>
        </div>
        <Button icon={Plus} onClick={() => setBuilderOpen(true)}>
          Novo objetivo com o Oráculo
        </Button>
      </div>

      <div className="inline-flex rounded-xl border border-border bg-surface p-1 shadow-card">
        <button
          type="button"
          onClick={() => setTab("build")}
          className={[
            "rounded-[10px] px-4 py-2 text-sm font-medium transition",
            tab === "build" ? "bg-[#F0F7FF] text-accent" : "text-text-secondary hover:text-text",
          ].join(" ")}
        >
          Construir com o Oráculo
        </button>
        <button
          type="button"
          onClick={() => setTab("paste")}
          className={[
            "rounded-[10px] px-4 py-2 text-sm font-medium transition",
            tab === "paste" ? "bg-[#F0F7FF] text-accent" : "text-text-secondary hover:text-text",
          ].join(" ")}
        >
          Colar plano pronto
        </button>
      </div>

      {tab === "paste" ? (
        <div className="space-y-4">
          <Card>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-text">Plano existente</span>
              <textarea
                value={pastedPlan}
                onChange={(event) => setPastedPlan(event.target.value)}
                rows={10}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm leading-6"
                placeholder="Cole aqui o planejamento existente"
              />
            </label>
            <div className="mt-4">
              <Button icon={ClipboardCheck} onClick={() => setReview(reviewPastedPlan(pastedPlan))}>
                Pedir revisão ao Oráculo
              </Button>
            </div>
          </Card>
          {review ? <ReviewResult review={review} /> : null}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <p className="mb-3 text-sm font-semibold text-text">Identificação e contexto</p>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-text-tertiary">Setor</dt>
                  <dd className="font-medium text-text">{plan.profile.sector}</dd>
                </div>
                <div>
                  <dt className="text-text-tertiary">Porte</dt>
                  <dd className="font-medium text-text">{plan.profile.size}</dd>
                </div>
                <div>
                  <dt className="text-text-tertiary">Região</dt>
                  <dd className="font-medium text-text">{plan.profile.region}</dd>
                </div>
                <div>
                  <dt className="text-text-tertiary">Fundação</dt>
                  <dd className="font-medium text-text">{plan.profile.founded}</dd>
                </div>
              </dl>
              <p className="mt-4 text-sm leading-6 text-text-secondary">{plan.profile.mainPain}</p>
            </Card>

            <Card>
              <p className="mb-3 text-sm font-semibold text-text">Direcionadores</p>
              <div className="space-y-4 text-sm leading-6">
                <p>
                  <span className="font-medium text-text">Propósito: </span>
                  <span className="text-text-secondary">{plan.drivers.purpose}</span>
                </p>
                <p>
                  <span className="font-medium text-text">Visão: </span>
                  <span className="text-text-secondary">{plan.drivers.vision}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {plan.drivers.values.map((value) => (
                    <span key={value} className="rounded-[10px] bg-[#F0F0F2] px-2.5 py-1 text-xs font-medium text-text-secondary">
                      {value}
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-4">
            <ListBlock title="Forças" items={plan.swot.strengths} />
            <ListBlock title="Fraquezas" items={plan.swot.weaknesses} />
            <ListBlock title="Oportunidades" items={plan.swot.opportunities} />
            <ListBlock title="Ameaças" items={plan.swot.threats} />
          </div>

          <Card>
            <p className="mb-3 text-sm font-semibold text-text">Tema do ano</p>
            <div className="flex flex-wrap gap-2">
              {plan.themes.map((theme) => (
                <span key={theme} className="rounded-xl bg-[#F0F7FF] px-3 py-2 text-sm font-medium text-accent">
                  {theme}
                </span>
              ))}
            </div>
          </Card>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text">Objetivos estratégicos</h2>
            <div className="grid gap-4">
              {strategicObjectives.map((objective) => (
                <ObjectiveCard key={objective.id} objective={objective} />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text">Projetos prioritários</h2>
            <div className="grid gap-4 lg:grid-cols-3">
              {plan.projects.map((project) => {
                const linkedObjective = state.objectives.find((objective) => objective.id === project.linkedObjectiveId);
                return (
                  <Card key={project.id}>
                    <p className="text-sm font-semibold text-text">{project.name}</p>
                    <p className="mt-2 text-sm text-text-secondary">Dono: {project.owner}</p>
                    <p className="mt-1 text-sm text-text-secondary">Prazo: {formatDate(project.deadline)}</p>
                    <div className="mt-3">
                      {linkedObjective ? <LineageTag objective={{ ...linkedObjective, level: "area_annual" }} parent={linkedObjective} /> : null}
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
            <ListBlock title="Rituais de acompanhamento" items={plan.rituals} />
            <Card>
              <p className="mb-3 text-sm font-semibold text-text">Resumo executivo</p>
              <p className="text-sm leading-6 text-text-secondary">{plan.executiveSummary}</p>
            </Card>
          </div>
        </div>
      )}

      {builderOpen ? <ObjectiveBuilder level="strategic" onClose={() => setBuilderOpen(false)} /> : null}
    </div>
  );
}
