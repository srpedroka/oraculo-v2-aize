import { Pencil, Sprout, Trophy } from "lucide-react";
import { useState } from "react";
import type { KeyAction, Objective } from "../../types";
import { TYPE_LABEL } from "../../types";
import { formatDate, shortDate } from "../../lib/format";
import { Card } from "../../components/ui/Card";
import { ConcretenessMeter } from "../../components/ui/ConcretenessMeter";
import { LineageTag } from "../../components/ui/LineageTag";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
import { useAppState } from "../../state/store";
import { ObjectiveEditDialog } from "./ObjectiveEditDialog";

interface ObjectiveCardProps {
  objective: Objective;
  parent?: Objective;
  keyActions?: KeyAction[];
  highlighted?: boolean;
}

export function ObjectiveCard({ objective, parent, keyActions = [], highlighted = false }: ObjectiveCardProps) {
  const { state } = useAppState();
  const [editOpen, setEditOpen] = useState(false);
  const TypeIcon = objective.type === "harvest" ? Trophy : Sprout;
  const isOwner = state.currentMembership?.role === "owner";
  const isAreaCoordinator = Boolean(
    objective.areaId &&
      state.currentMembership?.role === "coordinator" &&
      state.areas.some((area) => area.id === objective.areaId && area.coordinatorId === state.currentMembership?.id),
  );
  const canEdit = isOwner || isAreaCoordinator;

  return (
    <>
    <Card className={highlighted ? "border-accent/40 bg-[#F7FBFF]" : ""}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                <TypeIcon className="h-4 w-4" />
                {TYPE_LABEL[objective.type]}
              </span>
              <StatusBadge status={objective.status} />
              {highlighted ? (
                <span className="rounded-[10px] bg-[#E8F2FF] px-2.5 py-1 text-xs font-medium text-accent">
                  Principal
                </span>
              ) : null}
            </div>
            <h3 className="text-[16px] font-semibold leading-snug text-text">{objective.title}</h3>
            <p className="mt-1 text-sm leading-6 text-text-secondary">{objective.result}</p>
          </div>
          <div className="flex flex-col items-end gap-2 text-right text-xs text-text-secondary">
            <div>
              <p className="font-medium text-text">{objective.owner || "Sem responsável"}</p>
              <p>{formatDate(objective.deadline)}</p>
            </div>
            {canEdit ? (
              <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditOpen(true)}>
                Editar
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <LineageTag objective={objective} parent={parent} />
          <ConcretenessMeter objective={objective} compact />
        </div>

        {typeof objective.progress === "number" ? <ProgressBar value={objective.progress} /> : null}

        {objective.deliverables?.length ? (
          <div className="rounded-xl border border-border bg-[#FAFAFB] p-3">
            <p className="mb-2 text-xs font-medium text-text-tertiary">Entregas principais</p>
            <div className="flex flex-wrap gap-2">
              {objective.deliverables.map((deliverable) => (
                <span key={deliverable} className="rounded-[10px] bg-white px-2.5 py-1 text-xs text-text-secondary">
                  {deliverable}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {objective.level === "monthly" ? (
          <div className="rounded-xl border border-border bg-[#FAFAFB] p-3">
            <p className="mb-3 text-xs font-medium text-text-tertiary">Ações-chave</p>
            {keyActions.length ? (
              <div className="space-y-2">
                {keyActions.map((action) => (
                  <div key={action.id} className="grid gap-2 rounded-xl bg-white p-3 text-sm md:grid-cols-[1fr_auto]">
                    <div>
                      <p className="font-medium text-text">{action.description}</p>
                      <p className="text-xs text-text-secondary">{action.completionCriterion}</p>
                    </div>
                    <div className="text-left text-xs text-text-secondary md:text-right">
                      <p>{action.owner}</p>
                      <p>{shortDate(action.deadline)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-secondary">Nenhuma ação-chave ainda. Detalhe com o Oráculo quando fizer sentido.</p>
            )}
          </div>
        ) : null}
      </div>
    </Card>
    {editOpen ? <ObjectiveEditDialog objective={objective} onClose={() => setEditOpen(false)} /> : null}
    </>
  );
}
