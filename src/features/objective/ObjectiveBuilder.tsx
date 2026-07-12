import { Plus, Save, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { buildSavedObjectiveResponse, createMessageId } from "../../lib/oracle";
import { currentMonthPeriod, currentQuarterPeriod, currentYear } from "../../lib/periods";
import { evaluateConcreteness, getConcretenessTone } from "../../lib/concreteness";
import { useAppState } from "../../state/store";
import type { KeyAction, Objective, ObjectiveType, PlanLevel } from "../../types";
import { LEVEL_LABEL, TYPE_LABEL } from "../../types";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ConcretenessMeter } from "../../components/ui/ConcretenessMeter";
import { ObjectiveKpiSuggestionPanel } from "./ObjectiveKpiSuggestionPanel";

interface ObjectiveBuilderProps {
  level: PlanLevel;
  areaId?: string | null;
  onClose: () => void;
}

interface DraftAction {
  description: string;
  completionCriterion: string;
  deadline: string;
  owner: string;
}

const PERIOD_BY_LEVEL: Record<PlanLevel, string> = {
  strategic: String(currentYear()),
  area_annual: String(currentYear()),
  quarterly: currentQuarterPeriod(),
  monthly: currentMonthPeriod(),
};

function createObjectiveId() {
  return crypto.randomUUID();
}

function createTitleFromResult(result: string) {
  if (!result.trim()) return "Novo objetivo";
  return result.trim().length > 72 ? `${result.trim().slice(0, 69)}...` : result.trim();
}

export function ObjectiveBuilder({ level, areaId = null, onClose }: ObjectiveBuilderProps) {
  const { state, dispatch } = useAppState();
  const area = state.areas.find((item) => item.id === areaId);
  const parentOptions = useMemo(() => {
    if (level === "strategic") return [];
    if (level === "area_annual") return state.objectives.filter((objective) => objective.level === "strategic");
    if (level === "quarterly") {
      return state.objectives.filter((objective) => objective.level === "area_annual" && objective.areaId === areaId);
    }
    return state.objectives.filter((objective) => objective.level === "quarterly" && objective.areaId === areaId);
  }, [areaId, level, state.objectives]);

  const defaultOwner = area?.coordinator ?? "Gui";
  // Token estável desta criação (idempotência no servidor: o id do objetivo é derivado
  // dele). O builder salva um único objetivo (guarda saving/savedObjectiveId), então um
  // token por instância basta.
  const saveTokenRef = useRef(crypto.randomUUID());
  const [type, setType] = useState<ObjectiveType>("harvest");
  const [parentId, setParentId] = useState(parentOptions[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [result, setResult] = useState("");
  const [metric, setMetric] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [owner, setOwner] = useState(defaultOwner);
  const [evidencePlan, setEvidencePlan] = useState("");
  const [deliverables, setDeliverables] = useState("");
  const [actions, setActions] = useState<DraftAction[]>([]);
  const [savedObjectiveId, setSavedObjectiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const draftObjective: Objective = {
    id: "draft",
    level,
    type,
    title: title.trim() || createTitleFromResult(result),
    result,
    metric: metric || undefined,
    target: target || undefined,
    deadline: deadline || null,
    owner,
    evidencePlan,
    status: "on_track",
    progress: 0,
    deliverables:
      level === "quarterly"
        ? deliverables
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean)
        : undefined,
    areaId: level === "strategic" ? null : areaId,
    parentId: level === "strategic" ? null : parentId || null,
    period: PERIOD_BY_LEVEL[level],
  };

  const concretenessResult = evaluateConcreteness(draftObjective);

  function addAction() {
    setActions((current) => [
      ...current,
      { description: "", completionCriterion: "", deadline: "", owner: defaultOwner },
    ]);
  }

  function updateAction(index: number, field: keyof DraftAction, value: string) {
    setActions((current) => current.map((action, itemIndex) => (itemIndex === index ? { ...action, [field]: value } : action)));
  }

  function saveObjective() {
    if (saving || savedObjectiveId) return;
    setSaving(true);
    setSaveError("");
    const id = createObjectiveId();
    const objective: Objective = {
      ...draftObjective,
      id,
      title: title.trim() || createTitleFromResult(result),
      result: result.trim() || title.trim() || "Objetivo em evolução",
      owner: owner.trim(),
      evidencePlan: evidencePlan.trim(),
    };
    const savedActions: KeyAction[] = actions
      .filter((action) => action.description.trim() || action.completionCriterion.trim())
      .map((action, index) => ({
        id: crypto.randomUUID(),
        objectiveId: id,
        description: action.description.trim() || "Ação em evolução",
        completionCriterion: action.completionCriterion.trim() || "Critério a definir",
        deadline: action.deadline || null,
        owner: action.owner.trim() || objective.owner,
      }));

    dispatch({
      type: "add_objective",
      objective,
      keyActions: savedActions,
      token: saveTokenRef.current,
      onSuccess: (objectiveId) => {
        dispatch({
          type: "add_chat_message",
          message: {
            id: createMessageId("oracle"),
            author: "oracle",
            text: buildSavedObjectiveResponse(objective),
          },
        });
        setSavedObjectiveId(objectiveId);
        setSaving(false);
      },
      onError: (message) => {
        setSaving(false);
        setSaveError(message);
      },
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 p-4 backdrop-blur-[2px]">
      <Card className="max-h-[92vh] w-full max-w-3xl overflow-auto p-0">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-6 py-4">
          <div>
            <p className="text-xs font-medium text-text-tertiary">Novo objetivo</p>
            <h2 className="text-xl font-semibold text-text">{LEVEL_LABEL[level]}</h2>
          </div>
          <Button variant="quiet" size="icon" icon={X} onClick={onClose} aria-label="Fechar" />
        </div>

        <div className="space-y-6 p-6">
          <section className="space-y-3">
            <p className="text-sm font-medium text-text">Tipo</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["harvest", "seed"] as ObjectiveType[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setType(item)}
                  className={[
                    "rounded-2xl border p-4 text-left transition",
                    type === item ? "border-accent bg-[#F7FBFF]" : "border-border bg-white hover:border-accent/30",
                  ].join(" ")}
                >
                  <span className="block text-sm font-semibold text-text">{TYPE_LABEL[item]}</span>
                  <span className="mt-1 block text-sm leading-5 text-text-secondary">
                    {item === "harvest"
                      ? "Colhe o jogo atual: receita, margem, produção, prazo."
                      : "Planta o próximo jogo: autonomia, produto, liderança, processo."}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {level !== "strategic" ? (
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Objetivo superior</span>
              <select
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-text"
              >
                {parentOptions.length ? null : <option value="">Nenhum objetivo disponível</option>}
                {parentOptions.map((objective) => (
                  <option key={objective.id} value={objective.id}>
                    {objective.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-text">Título curto</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex: Reduzir refugo de granito"
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-text"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-text">Resultado observável</span>
              <textarea
                value={result}
                onChange={(event) => setResult(event.target.value)}
                placeholder="Ex: Reduzir o refugo de 9% para 6% até 30/09"
                rows={3}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm leading-6 text-text"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Indicador</span>
              <input
                value={metric}
                onChange={(event) => setMetric(event.target.value)}
                placeholder="Ex: Refugo de granito"
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-text"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Meta</span>
              <input
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                placeholder="Ex: 6%"
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-text"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Prazo</span>
              <input
                type="date"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-text"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Responsável</span>
              <input
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-text"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-text">Evidência definida</span>
              <input
                value={evidencePlan}
                onChange={(event) => setEvidencePlan(event.target.value)}
                placeholder="Ex: Relatório semanal validado"
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-text"
              />
            </label>
          </div>

          {level === "quarterly" ? (
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Entregas principais</span>
              <textarea
                value={deliverables}
                onChange={(event) => setDeliverables(event.target.value)}
                placeholder={"Uma entrega por linha"}
                rows={3}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm leading-6 text-text"
              />
            </label>
          ) : null}

          {level === "monthly" ? (
            <section className="space-y-3 rounded-2xl border border-border bg-[#FAFAFB] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-text">Ações-chave</p>
                  <p className="text-xs text-text-secondary">De 2 a 5 ações, com critério, prazo e responsável.</p>
                </div>
                <Button variant="ghost" size="sm" icon={Plus} onClick={addAction}>
                  Adicionar ação
                </Button>
              </div>
              {actions.map((action, index) => (
                <div key={index} className="grid gap-3 rounded-2xl border border-border bg-white p-3 md:grid-cols-2">
                  <input
                    value={action.description}
                    onChange={(event) => updateAction(index, "description", event.target.value)}
                    placeholder="Verbo + o que será feito"
                    className="h-10 rounded-xl border border-border px-3 text-sm"
                  />
                  <input
                    value={action.completionCriterion}
                    onChange={(event) => updateAction(index, "completionCriterion", event.target.value)}
                    placeholder="Critério de conclusão"
                    className="h-10 rounded-xl border border-border px-3 text-sm"
                  />
                  <input
                    type="date"
                    value={action.deadline}
                    onChange={(event) => updateAction(index, "deadline", event.target.value)}
                    className="h-10 rounded-xl border border-border px-3 text-sm"
                  />
                  <input
                    value={action.owner}
                    onChange={(event) => updateAction(index, "owner", event.target.value)}
                    placeholder="Responsável"
                    className="h-10 rounded-xl border border-border px-3 text-sm"
                  />
                </div>
              ))}
              {!actions.length ? (
                <p className="rounded-xl bg-white p-3 text-sm text-text-secondary">
                  Pode salvar sem ações agora. O objetivo aparece como “Em evolução” até detalhar melhor.
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-2xl border border-border bg-[#FAFAFB] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ConcretenessMeter objective={draftObjective} />
              <p className="max-w-xl text-sm leading-6 text-text-secondary">
                {getConcretenessTone(level, concretenessResult.firstMissing?.invitation)}
              </p>
            </div>
          </section>
          {saveError ? <p className="text-sm text-status-danger">{saveError}</p> : null}
          {savedObjectiveId ? <ObjectiveKpiSuggestionPanel objectiveId={savedObjectiveId} onDone={onClose} /> : null}
        </div>

        {!savedObjectiveId ? <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface px-6 py-4">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon={Save} onClick={saveObjective} disabled={saving}>
            {saving ? "Salvando..." : "Salvar objetivo"}
          </Button>
        </div> : null}
      </Card>
    </div>
  );
}
