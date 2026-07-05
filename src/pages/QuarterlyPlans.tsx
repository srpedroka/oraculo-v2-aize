import { Link } from "react-router-dom";
import { ArrowRight, Building2, FileText, Loader2, Plus, Upload, Waypoints } from "lucide-react";
import { ChangeEvent, FormEvent, useState } from "react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { StatusBadge } from "../components/ui/StatusBadge";
import { ObjectiveBuilder } from "../features/objective/ObjectiveBuilder";
import { ObjectiveCard } from "../features/objective/ObjectiveCard";
import { importPlanFile, PLAN_FILE_ACCEPT } from "../lib/fileImport";
import { currentQuarterPeriod } from "../lib/periods";
import { useAppState } from "../state/store";
import type { Status } from "../types";

const CURRENT_QUARTER_PERIOD = currentQuarterPeriod();
const IMPORT_TEXT_LIMIT = 24000;

type ImportStatus = {
  areaId: string;
  kind: "success" | "error";
  text: string;
};

export function QuarterlyPlans() {
  const { state, dispatch } = useAppState();
  const [areaName, setAreaName] = useState("");
  const [builderAreaId, setBuilderAreaId] = useState<string | null>(null);
  const [importingAreaId, setImportingAreaId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null);
  const isOwner = state.currentMembership?.role === "owner";

  function createArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!areaName.trim() || !isOwner) return;
    dispatch({ type: "create_area", name: areaName.trim() });
    setAreaName("");
  }

  function canPlanArea(areaId: string) {
    if (isOwner) return true;
    return Boolean(
      state.currentMembership?.role === "coordinator" &&
        state.areas.some((area) => area.id === areaId && area.coordinatorId === state.currentMembership?.id),
    );
  }

  async function processQuarterlyPlanFile(areaId: string, file: File | undefined) {
    if (!file) return;
    setImportingAreaId(areaId);
    setImportStatus(null);

    try {
      const imported = await importPlanFile(file);
      const safeText =
        imported.text.length > IMPORT_TEXT_LIMIT
          ? `${imported.text.slice(0, IMPORT_TEXT_LIMIT)}\n\n[Texto cortado pelo limite de contexto. Se precisar, peça o restante do arquivo antes de gravar.]`
          : imported.text;

      dispatch({
        type: "import_ready_quarterly_plan",
        areaId,
        period: CURRENT_QUARTER_PERIOD,
        text: safeText,
        fileName: imported.fileName,
      });
      setImportStatus({
        areaId,
        kind: "success",
        text: `Arquivo "${imported.fileName}" enviado ao Oráculo. Confira a proposta no painel lateral antes de gravar.`,
      });
    } catch (error) {
      setImportStatus({
        areaId,
        kind: "error",
        text: error instanceof Error ? error.message : "Não foi possível importar o arquivo.",
      });
    } finally {
      setImportingAreaId(null);
    }
  }

  function handleQuarterlyPlanFile(areaId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    void processQuarterlyPlanFile(areaId, file);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text-tertiary">Planejamento da execução · {CURRENT_QUARTER_PERIOD}</p>
          <h1 className="text-2xl font-semibold text-text">Planos Trimestrais</h1>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary shadow-card">
          <Waypoints className="h-4 w-4" />
          Trimestre vigente
        </div>
      </div>

      <div className="space-y-5">
        {!state.areas.length ? (
          <Card>
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 h-5 w-5 text-text-secondary" />
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-text">Nenhuma área cadastrada.</p>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  Antes de montar planos trimestrais, cadastre os departamentos que vão executar a estratégia.
                </p>
                {isOwner ? (
                  <form onSubmit={createArea} className="mt-4 flex flex-wrap gap-2">
                    <input
                      value={areaName}
                      onChange={(event) => setAreaName(event.target.value)}
                      placeholder="Nome da área ou departamento"
                      className="h-10 min-w-[220px] flex-1 rounded-xl border border-border bg-white px-3 text-sm"
                    />
                    <Button type="submit" icon={Plus} disabled={!areaName.trim()}>
                      Criar área
                    </Button>
                  </form>
                ) : (
                  <p className="mt-4 rounded-xl border border-border bg-[#FAFAFB] px-3 py-2 text-sm text-text-secondary">
                    Sua conta pode consultar planos, mas o cadastro de áreas fica com o dono da empresa.
                  </p>
                )}
              </div>
            </div>
          </Card>
        ) : null}
        {state.areas.map((area) => {
          const plan = state.areaPlans.find((item) => item.areaId === area.id);
          const quarterlyObjectives = state.objectives.filter(
            (objective) => objective.areaId === area.id && objective.level === "quarterly" && objective.period === CURRENT_QUARTER_PERIOD,
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
                  {canPlanArea(area.id) ? (
                    <>
                      <label
                        className={[
                          "inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-border bg-transparent px-3 text-[13px] font-medium text-text transition hover:border-accent/30 hover:bg-white",
                          importingAreaId === area.id ? "cursor-wait opacity-70" : "",
                        ].join(" ")}
                      >
                        {importingAreaId === area.id ? (
                          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload aria-hidden="true" className="h-4 w-4" />
                        )}
                        <span>{importingAreaId === area.id ? "Importando" : "Importar plano"}</span>
                        <input
                          className="sr-only"
                          type="file"
                          accept={PLAN_FILE_ACCEPT}
                          disabled={Boolean(importingAreaId)}
                          onChange={(event) => handleQuarterlyPlanFile(area.id, event)}
                        />
                      </label>
                      <Button variant="ghost" size="sm" icon={Plus} onClick={() => setBuilderAreaId(area.id)}>
                        Criar objetivo
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              {importStatus?.areaId === area.id ? (
                <p
                  className={[
                    "flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs leading-5",
                    importStatus.kind === "success"
                      ? "border-[#BFE6CE] bg-[#F3FBF6] text-[#1D7A3E]"
                      : "border-[#F3C4C4] bg-[#FFF7F7] text-[#B42318]",
                  ].join(" ")}
                >
                  <FileText aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{importStatus.text}</span>
                </p>
              ) : null}

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
                  <div className="rounded-2xl border border-dashed border-border bg-[#FAFAFB] p-5">
                    <p className="text-sm text-text-secondary">Nenhum objetivo trimestral definido para esta área.</p>
                    {canPlanArea(area.id) ? (
                      <div className="mt-3">
                        <Button variant="ghost" size="sm" icon={Plus} onClick={() => setBuilderAreaId(area.id)}>
                          Criar objetivo trimestral
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {builderAreaId ? <ObjectiveBuilder level="quarterly" areaId={builderAreaId} onClose={() => setBuilderAreaId(null)} /> : null}
    </div>
  );
}
