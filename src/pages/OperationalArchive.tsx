import {
  ArchiveRestore,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileCheck2,
  FileText,
  FolderKanban,
  History,
  ListChecks,
  Target,
  type LucideIcon,
} from "lucide-react";
import { ReactNode, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { formatDate } from "../lib/format";
import { useAppState } from "../state/store";
import type { OperationalEntityType, OperationalRevision } from "../types";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

interface ArchiveRowProps {
  icon: LucideIcon;
  title: string;
  meta: string;
  reason?: string | null;
  archivedAt?: string | null;
  canRestore: boolean;
  busy: boolean;
  onRestore: () => void;
  viewTo?: string;
}

function ArchiveRow({ icon: Icon, title, meta, reason, archivedAt, canRestore, busy, onRestore, viewTo }: ArchiveRowProps) {
  return (
    <div className="grid gap-3 border-b border-border py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-5 text-text">{title}</p>
          <p className="mt-1 text-xs leading-5 text-text-secondary">{meta}{archivedAt ? ` · ${formatDate(archivedAt)}` : ""}</p>
          {reason ? <p className="mt-1 text-sm leading-5 text-text-secondary">Motivo: {reason}</p> : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {viewTo ? (
          <Link
            to={viewTo}
            className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-transparent text-text-secondary transition hover:bg-fill-hover hover:text-text"
            aria-label="Abrir documento"
            title="Abrir documento"
          >
            <Eye className="h-4 w-4" />
          </Link>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          icon={ArchiveRestore}
          loading={busy}
          disabled={!canRestore}
          onClick={onRestore}
          title={canRestore ? "Restaurar para a operação" : "Sem permissão para restaurar este registro"}
        >
          Restaurar
        </Button>
      </div>
    </div>
  );
}

function ArchiveSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (!count) return null;
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <h2 className="text-base font-semibold text-text">{title}</h2>
        <span className="text-xs font-medium text-text-tertiary">{count}</span>
      </div>
      <div>{children}</div>
    </Card>
  );
}

function snapshot(revision: OperationalRevision) {
  return Object.keys(revision.afterData).length ? revision.afterData : revision.beforeData;
}

function textValue(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "string" ? value : "";
}

function revisionLabel(revision: OperationalRevision, kpiNames: Map<string, string>) {
  const data = snapshot(revision);
  if (revision.entityType === "objective") return textValue(data, "title") || "Objetivo";
  if (revision.entityType === "key_action") return textValue(data, "description") || "Ação-chave";
  if (revision.entityType === "strategic_project") return textValue(data, "name") || "Projeto estratégico";
  if (revision.entityType === "evidence") return textValue(data, "text") || "Evidência";
  if (revision.entityType === "check_in") return `Check-in ${textValue(data, "period")}`;
  if (revision.entityType === "plan_document") return textValue(data, "title") || "Documento";
  if (revision.entityType === "strategic_plan") return `Plano Estratégico ${String(data.year ?? "")}`.trim();
  if (revision.entityType === "area_plan") return `Plano da Área ${String(data.year ?? "")}`.trim();
  if (revision.entityType === "executive_kpi") return textValue(data, "label") || "KPI executivo";
  const month = Number(data.month ?? 0);
  const kpiId = textValue(data, "kpi_id");
  return `${kpiNames.get(kpiId) ?? "KPI"} · ${MONTHS[month - 1] ?? "Mês"}/${String(data.year ?? "")}`;
}

function revisionAction(revision: OperationalRevision) {
  if (revision.action === "archive") return "Retirado da operação";
  if (revision.action === "restore") return "Restaurado";
  return "Atualizado";
}

export function OperationalArchive() {
  const { state, dispatch } = useAppState();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isOwner = state.currentMembership?.role === "owner";

  const archivedObjectiveBatches = useMemo(
    () => new Set(state.archivedObjectives.map((objective) => objective.archiveBatchId).filter(Boolean)),
    [state.archivedObjectives],
  );
  const archivedObjectivesById = useMemo(
    () => new Map(state.archivedObjectives.map((objective) => [objective.id, objective])),
    [state.archivedObjectives],
  );
  const rootObjectives = useMemo(
    () =>
      state.archivedObjectives.filter((objective) => {
        if (!objective.parentId || !objective.archiveBatchId) return true;
        return archivedObjectivesById.get(objective.parentId)?.archiveBatchId !== objective.archiveBatchId;
      }),
    [archivedObjectivesById, state.archivedObjectives],
  );
  const independentActions = state.archivedKeyActions.filter((action) => !action.archiveBatchId || !archivedObjectiveBatches.has(action.archiveBatchId));
  const independentEvidences = state.archivedEvidences.filter((evidence) => !evidence.archiveBatchId || !archivedObjectiveBatches.has(evidence.archiveBatchId));
  const kpiNames = useMemo(() => new Map(state.executiveKpis.map((kpi) => [kpi.id, kpi.label])), [state.executiveKpis]);

  function canWriteArea(areaId: string | null | undefined) {
    if (isOwner) return !areaId || state.areas.some((area) => area.id === areaId);
    if (!areaId || state.currentMembership?.role !== "coordinator") return false;
    return state.areas.some((area) => area.id === areaId && area.coordinatorId === state.currentMembership?.id);
  }

  function restore(entityType: OperationalEntityType, entityId: string) {
    const key = `${entityType}:${entityId}`;
    setBusyKey(key);
    setMessage(null);
    setError(null);
    dispatch({
      type: "set_operational_item_archived",
      entityType,
      entityId,
      archived: false,
      onSuccess: () => {
        setBusyKey(null);
        setMessage("Registro restaurado para a operação.");
      },
      onError: (errorMessage) => {
        setBusyKey(null);
        setError(errorMessage);
      },
    });
  }

  const archivedCount =
    rootObjectives.length +
    independentActions.length +
    state.archivedProjects.length +
    independentEvidences.length +
    state.archivedCheckIns.length +
    state.archivedPlanDocuments.length;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-text-tertiary">Histórico preservado</p>
        <h1 className="text-2xl font-semibold text-text">Arquivo operacional</h1>
      </div>

      {message ? <p role="status" aria-live="polite" className="border-l-2 border-status-success pl-3 text-sm text-status-success">{message}</p> : null}
      {error ? <p className="border-l-2 border-status-danger pl-3 text-sm text-status-danger">{error}</p> : null}

      {!archivedCount ? (
        <Card className="text-center">
          <CheckCircle2 className="mx-auto h-5 w-5 text-status-success" />
          <p className="mt-3 text-base font-semibold text-text">Nenhum registro retirado</p>
          <p className="mt-1 text-sm text-text-secondary">Objetivos, ações, projetos, evidências, check-ins e documentos ativos estão em seus fluxos de origem.</p>
        </Card>
      ) : null}

      <ArchiveSection title="Objetivos" count={rootObjectives.length}>
        {rootObjectives.map((objective) => {
          const area = objective.areaId ? [...state.areas, ...state.archivedAreas].find((item) => item.id === objective.areaId) : null;
          return (
            <ArchiveRow
              key={objective.id}
              icon={Target}
              title={objective.title}
              meta={`${area?.name ?? "Empresa"} · ${objective.period}`}
              reason={objective.archiveReason}
              archivedAt={objective.archivedAt}
              canRestore={canWriteArea(objective.areaId)}
              busy={busyKey === `objective:${objective.id}`}
              onRestore={() => restore("objective", objective.id)}
            />
          );
        })}
      </ArchiveSection>

      <ArchiveSection title="Ações-chave" count={independentActions.length}>
        {independentActions.map((action) => (
          <ArchiveRow
            key={action.id}
            icon={ListChecks}
            title={action.description}
            meta={state.objectives.find((objective) => objective.id === action.objectiveId)?.title ?? "Objetivo"}
            reason={action.archiveReason}
            archivedAt={action.archivedAt}
            canRestore={canWriteArea(state.objectives.find((objective) => objective.id === action.objectiveId)?.areaId)}
            busy={busyKey === `key_action:${action.id}`}
            onRestore={() => restore("key_action", action.id)}
          />
        ))}
      </ArchiveSection>

      <ArchiveSection title="Projetos prioritários" count={state.archivedProjects.length}>
        {state.archivedProjects.map((project) => (
          <ArchiveRow
            key={project.id}
            icon={FolderKanban}
            title={project.name}
            meta={project.owner || "Sem responsável"}
            reason={project.archiveReason}
            archivedAt={project.archivedAt}
            canRestore={isOwner}
            busy={busyKey === `strategic_project:${project.id}`}
            onRestore={() => restore("strategic_project", project.id)}
          />
        ))}
      </ArchiveSection>

      <ArchiveSection title="Evidências estornadas" count={independentEvidences.length}>
        {independentEvidences.map((evidence) => {
          const objective = state.objectives.find((item) => item.id === evidence.objectiveId);
          return (
            <ArchiveRow
              key={evidence.id}
              icon={FileCheck2}
              title={evidence.text}
              meta={objective?.title ?? "Objetivo"}
              reason={evidence.archiveReason}
              archivedAt={evidence.archivedAt}
              canRestore={canWriteArea(objective?.areaId)}
              busy={busyKey === `evidence:${evidence.id}`}
              onRestore={() => restore("evidence", evidence.id)}
            />
          );
        })}
      </ArchiveSection>

      <ArchiveSection title="Check-ins estornados" count={state.archivedCheckIns.length}>
        {state.archivedCheckIns.map((checkIn) => {
          const area = checkIn.areaId ? [...state.areas, ...state.archivedAreas].find((item) => item.id === checkIn.areaId) : null;
          return (
            <ArchiveRow
              key={checkIn.id}
              icon={ClipboardCheck}
              title={checkIn.summary || `Check-in ${checkIn.period}`}
              meta={`${area?.name ?? "Empresa"} · ${checkIn.period}`}
              reason={checkIn.archiveReason}
              archivedAt={checkIn.archivedAt}
              canRestore={canWriteArea(checkIn.areaId)}
              busy={busyKey === `check_in:${checkIn.id}`}
              onRestore={() => restore("check_in", checkIn.id)}
            />
          );
        })}
      </ArchiveSection>

      <ArchiveSection title="Documentos arquivados" count={state.archivedPlanDocuments.length}>
        {state.archivedPlanDocuments.map((document) => (
          <ArchiveRow
            key={document.id}
            icon={FileText}
            title={document.title}
            meta={`${document.period} · Versão ${document.version}`}
            reason={document.archiveReason}
            archivedAt={document.archivedAt}
            canRestore={canWriteArea(document.areaId)}
            busy={busyKey === `plan_document:${document.id}`}
            onRestore={() => restore("plan_document", document.id)}
            viewTo={`/documentos/${document.id}/imprimir`}
          />
        ))}
      </ArchiveSection>

      <Card>
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <History className="h-4 w-4 text-text-tertiary" />
          <h2 className="text-base font-semibold text-text">Histórico de alterações</h2>
        </div>
        {state.operationalRevisions.length ? (
          <div className="divide-y divide-border">
            {state.operationalRevisions.slice(0, 80).map((revision) => (
              <div key={revision.id} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{revisionLabel(revision, kpiNames)}</p>
                  <p className="text-xs text-text-secondary">{revisionAction(revision)}</p>
                </div>
                <p className="text-xs text-text-tertiary">{formatDate(revision.createdAt)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-sm text-text-secondary">As próximas correções de planos, metas e lançamentos aparecerão aqui.</p>
        )}
      </Card>
    </div>
  );
}
