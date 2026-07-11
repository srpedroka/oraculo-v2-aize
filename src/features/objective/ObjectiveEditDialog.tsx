import { Archive, Save, X } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { useAppState } from "../../state/store";
import type { Membership, Objective, ObjectiveType, Status } from "../../types";
import { STATUS_LABEL, TYPE_LABEL } from "../../types";
import { formatDate } from "../../lib/format";
import { OperationalArchiveDialog } from "../lifecycle/OperationalArchiveDialog";
import { ObjectiveKpiSuggestionPanel } from "./ObjectiveKpiSuggestionPanel";

interface ObjectiveEditDialogProps {
  objective: Objective;
  onClose: () => void;
}

const STATUS_OPTIONS: Status[] = ["on_track", "at_risk", "late", "done"];
const TYPE_OPTIONS: ObjectiveType[] = ["harvest", "seed"];

function clampProgress(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function memberName(membership: Membership) {
  return membership.profile?.fullName || membership.profile?.email || "Membro";
}

export function ObjectiveEditDialog({ objective, onClose }: ObjectiveEditDialogProps) {
  const { state, dispatch } = useAppState();
  const [type, setType] = useState<ObjectiveType>(objective.type);
  const [title, setTitle] = useState(objective.title);
  const [result, setResult] = useState(objective.result);
  const [metric, setMetric] = useState(objective.metric ?? "");
  const [target, setTarget] = useState(objective.target ?? "");
  const [current, setCurrent] = useState(objective.current ?? "");
  const [trend, setTrend] = useState<"up" | "down" | "flat">(objective.trend ?? "flat");
  const [deadline, setDeadline] = useState(objective.deadline ?? "");
  const [owner, setOwner] = useState(objective.owner);
  const [ownerMembershipId, setOwnerMembershipId] = useState<string | null>(objective.ownerMembershipId ?? null);
  const [status, setStatus] = useState<Status>(objective.status);
  const members = state.memberships;
  const [progress, setProgress] = useState(objective.progress ?? 0);
  const [evidencePlan, setEvidencePlan] = useState(objective.evidencePlan);
  const [deliverables, setDeliverables] = useState((objective.deliverables ?? []).join("\n"));
  const [evidenceToArchive, setEvidenceToArchive] = useState<string | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [reviewKpis, setReviewKpis] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const evidences = state.evidences.filter((evidence) => evidence.objectiveId === objective.id);

  function save() {
    if (saving) return;
    setSaving(true);
    setSaveError("");
    dispatch({
      type: "update_objective",
      objective: {
        ...objective,
        type,
        title: title.trim() || objective.title,
        result: result.trim() || title.trim() || objective.result,
        metric: metric.trim() || undefined,
        target: target.trim() || undefined,
        current: current.trim() || undefined,
        trend,
        deadline: deadline || null,
        owner: owner.trim(),
        ownerMembershipId,
        status,
        progress: clampProgress(progress),
        evidencePlan: evidencePlan.trim(),
        deliverables: deliverables
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
      },
      onSuccess: () => {
        setSaving(false);
        setReviewKpis(true);
      },
      onError: (message) => {
        setSaving(false);
        setSaveError(message);
      },
    });
  }

  function archiveEvidence(reason: string) {
    if (!evidenceToArchive) return;
    setArchiveBusy(true);
    setArchiveError(null);
    dispatch({
      type: "set_operational_item_archived",
      entityType: "evidence",
      entityId: evidenceToArchive,
      archived: true,
      reason,
      onSuccess: () => {
        setArchiveBusy(false);
        setEvidenceToArchive(null);
      },
      onError: (message) => {
        setArchiveBusy(false);
        setArchiveError(message);
      },
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-[2px]">
      <Card className="max-h-[92vh] w-full max-w-3xl overflow-auto p-0">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-6 py-4">
          <div>
            <p className="text-xs font-medium text-text-tertiary">Editar objetivo</p>
            <h2 className="text-xl font-semibold text-text">{objective.title}</h2>
          </div>
          <Button variant="quiet" size="icon" icon={X} onClick={onClose} aria-label="Fechar" />
        </div>

        <div className="space-y-6 p-6">
          <section className="grid gap-3 sm:grid-cols-2">
            {TYPE_OPTIONS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setType(item)}
                className={[
                  "rounded-2xl border p-4 text-left transition",
                  type === item ? "border-[#1D1D1F] bg-[#F7F7F8]" : "border-border bg-white hover:border-[#1D1D1F]/20",
                ].join(" ")}
              >
                <span className="block text-sm font-semibold text-text">{TYPE_LABEL[item]}</span>
                <span className="mt-1 block text-sm leading-5 text-text-secondary">
                  {item === "harvest" ? "Resultado do jogo atual: faturamento, margem, prazo, produção." : "Evolução do próximo jogo: liderança, inovação, processo, capacidade."}
                </span>
              </button>
            ))}
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-text">Título</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-text" />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-text">Resultado esperado</span>
              <textarea value={result} onChange={(event) => setResult(event.target.value)} rows={3} className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm leading-6 text-text" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Indicador</span>
              <input value={metric} onChange={(event) => setMetric(event.target.value)} placeholder="Ex: Faturamento mensal" className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-text" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Meta</span>
              <input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="Ex: R$ 1,8M" className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-text" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Valor atual</span>
              <input value={current} onChange={(event) => setCurrent(event.target.value)} placeholder="Ex: R$ 1,2M" className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-text" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Tendência</span>
              <select value={trend} onChange={(event) => setTrend(event.target.value as "up" | "down" | "flat")} className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-text">
                <option value="up">Alta</option>
                <option value="flat">Estável</option>
                <option value="down">Queda</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Prazo</span>
              <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-text" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Responsável</span>
              <select
                value={ownerMembershipId ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!value) {
                    setOwnerMembershipId(null);
                    return;
                  }
                  setOwnerMembershipId(value);
                  const member = members.find((item) => item.id === value);
                  if (member) setOwner(memberName(member));
                }}
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-text"
              >
                <option value="">Responsável externo (texto)</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {memberName(member)}
                  </option>
                ))}
              </select>
              {ownerMembershipId === null ? (
                <input
                  value={owner}
                  onChange={(event) => setOwner(event.target.value)}
                  placeholder="Nome do responsável"
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-text"
                />
              ) : null}
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as Status)} className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-text">
                {STATUS_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {STATUS_LABEL[item]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-text">Evidência que comprova avanço</span>
              <input value={evidencePlan} onChange={(event) => setEvidencePlan(event.target.value)} placeholder="Ex: relatório, print, ata, foto ou planilha" className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-text" />
            </label>
          </section>

          <section className="rounded-2xl border border-border bg-[#FAFAFB] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-text">Progresso</p>
                <p className="text-xs text-text-secondary">Use para atualizar o percentual exibido nos cards e no dashboard.</p>
              </div>
              <input
                type="number"
                min={0}
                max={100}
                value={progress}
                onChange={(event) => setProgress(clampProgress(Number(event.target.value)))}
                className="h-10 w-24 rounded-xl border border-border bg-white px-3 text-sm text-text"
              />
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={progress}
              onChange={(event) => setProgress(clampProgress(Number(event.target.value)))}
              className="mb-3 w-full"
            />
            <ProgressBar value={progress} />
          </section>

          {objective.level === "quarterly" || deliverables.trim() ? (
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Entregas principais</span>
              <textarea
                value={deliverables}
                onChange={(event) => setDeliverables(event.target.value)}
                placeholder="Uma entrega por linha"
                rows={3}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm leading-6 text-text"
              />
            </label>
          ) : null}

          {evidences.length ? (
            <section>
              <p className="mb-2 text-sm font-medium text-text">Evidências registradas</p>
              <div className="divide-y divide-border border-y border-border">
                {evidences.map((evidence) => (
                  <div key={evidence.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm leading-6 text-text-secondary">{evidence.text}</p>
                      <p className="mt-1 text-xs text-text-tertiary">{formatDate(evidence.date)}</p>
                    </div>
                    <Button
                      variant="quiet"
                      size="icon"
                      icon={Archive}
                      onClick={() => {
                        setArchiveError(null);
                        setEvidenceToArchive(evidence.id);
                      }}
                      aria-label="Estornar evidência"
                      title="Estornar evidência"
                    />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {saveError ? <p className="text-sm text-status-danger">{saveError}</p> : null}
          {reviewKpis ? <ObjectiveKpiSuggestionPanel objectiveId={objective.id} onDone={onClose} /> : null}
        </div>

        {!reviewKpis ? <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface px-6 py-4">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon={Save} onClick={save} disabled={saving}>
            {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div> : null}
      </Card>
      {evidenceToArchive ? (
        <OperationalArchiveDialog
          eyebrow="Evidência"
          title="Estornar esta evidência?"
          description="A evidência deixa de contar na execução ativa e permanece registrada no Arquivo com o motivo do estorno."
          confirmLabel="Estornar evidência"
          busy={archiveBusy}
          error={archiveError}
          onClose={() => {
            if (archiveBusy) return;
            setEvidenceToArchive(null);
            setArchiveError(null);
          }}
          onConfirm={archiveEvidence}
        />
      ) : null}
    </div>
  );
}
