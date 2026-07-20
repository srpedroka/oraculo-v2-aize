import { Archive, CalendarCheck, ClipboardList, RefreshCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { InlineFeedback } from "../components/ui/InlineFeedback";
import { StatusBadge } from "../components/ui/StatusBadge";
import { formatDate } from "../lib/format";
import { previousMonthPeriod } from "../lib/periods";
import { recoverableFeedback, type RecoverableFeedback } from "../lib/uiFeedback";
import { useAppState } from "../state/store";
import { OperationalArchiveDialog } from "../features/lifecycle/OperationalArchiveDialog";
import { ExecutionCockpit } from "../features/execution/ExecutionCockpit";
import { useSessionLauncher } from "../hooks/useSessionLauncher";

export function Execution() {
  const { state, dispatch } = useAppState();
  const projects = state.strategicPlan?.projects ?? [];
  const rituals = state.strategicPlan?.rituals ?? [];
  const closePeriod = previousMonthPeriod();
  const [archiveTarget, setArchiveTarget] = useState<{ type: "strategic_project" | "check_in"; id: string; title: string } | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<RecoverableFeedback | null>(null);
  const isOwner = state.currentMembership?.role === "owner";
  const sessionLauncher = useSessionLauncher(dispatch);

  function archive(reason: string) {
    if (!archiveTarget) return;
    setArchiveBusy(true);
    setArchiveError(null);
    dispatch({
      type: "set_operational_item_archived",
      entityType: archiveTarget.type,
      entityId: archiveTarget.id,
      archived: true,
      reason,
      onSuccess: () => {
        setArchiveBusy(false);
        setArchiveTarget(null);
      },
      onError: (message) => {
        setArchiveBusy(false);
        setArchiveError(recoverableFeedback(
          message,
          "Não consegui retirar este item da operação.",
          "O item continua disponível. Tente novamente.",
          "OPERATIONAL_ARCHIVE_FAILED",
        ));
      },
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-text-tertiary">Projetos, rituais e fechamento mensal</p>
        <h1 className="text-2xl font-semibold text-text">Execução Viva</h1>
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

      <ExecutionCockpit />

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
                    <div className="flex items-center gap-1">
                      <StatusBadge status={project.status ?? "on_track"} />
                      {isOwner ? (
                        <Button
                          variant="quiet"
                          size="icon"
                          icon={Archive}
                          onClick={() => {
                            setArchiveError(null);
                            setArchiveTarget({ type: "strategic_project", id: project.id, title: project.name });
                          }}
                          aria-label={`Arquivar projeto ${project.name}`}
                          title="Retirar projeto da operação"
                        />
                      ) : null}
                    </div>
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
            <h2 className="text-base font-semibold text-text">Check-in e fechamento mensal</h2>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Para adicionar um check-in, inicie o fechamento guiado da área. Ao confirmar o resumo, o Oráculo salva o check-in, evidências e pendências do período.
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
                      loading={sessionLauncher.isStarting({ sessionType: "month_close", areaId: area.id, period: closePeriod })}
                      disabled={!monthlyObjectives.length}
                      title={monthlyObjectives.length ? "Revisar e fechar o mês" : "Crie o plano mensal antes do check-in"}
                      onClick={() => sessionLauncher.startSession({ sessionType: "month_close", areaId: area.id, period: closePeriod })}
                    >
                      Adicionar check-in
                    </Button>
                  </div>
                  {lastCheckIn ? (
                    <div className="mt-3 rounded-xl border border-[#D9EADF] bg-[#F5FBF7] px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-medium text-[#1D7A3E]">Check-in salvo</p>
                        {isOwner || (state.currentMembership?.role === "coordinator" && area.coordinatorId === state.currentMembership.id) ? (
                          <Button
                            variant="quiet"
                            size="icon"
                            icon={Archive}
                            onClick={() => {
                              setArchiveError(null);
                              setArchiveTarget({ type: "check_in", id: lastCheckIn.id, title: `${area.name} · ${lastCheckIn.period}` });
                            }}
                            aria-label="Estornar check-in"
                            title="Estornar check-in"
                          />
                        ) : null}
                      </div>
                      {lastCheckIn.details.managementPulse?.confidence ? (
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full border border-border bg-white px-2.5 py-1 font-medium text-text">
                            Confiança: {{ green: "verde", yellow: "amarela", red: "vermelha" }[lastCheckIn.details.managementPulse.confidence]}
                          </span>
                          {lastCheckIn.details.managementPulse.nextCommitment ? (
                            <span className="rounded-full border border-border bg-white px-2.5 py-1 text-text-secondary">
                              Próximo: {lastCheckIn.details.managementPulse.nextCommitment}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      <p className="mt-2 text-sm leading-6 text-text-secondary">{lastCheckIn.summary}</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm leading-6 text-text-secondary">
                      {monthlyObjectives.length
                        ? "Nenhum check-in registrado ainda. Use o botão para revisar o mês com o Oráculo e confirmar o registro."
                        : "Sem objetivo mensal nesse período. Crie o plano mensal antes de registrar um check-in útil."}
                    </p>
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
      {archiveTarget ? (
        <OperationalArchiveDialog
          eyebrow={archiveTarget.type === "strategic_project" ? "Projeto prioritário" : "Check-in"}
          title={archiveTarget.type === "strategic_project" ? `Retirar ${archiveTarget.title} da operação?` : `Estornar ${archiveTarget.title}?`}
          description={
            archiveTarget.type === "strategic_project"
              ? "O projeto deixa a lista ativa da Execução Viva e pode ser restaurado pelo Arquivo."
              : "O check-in deixa de ser considerado no fechamento ativo, mas seu conteúdo e autoria permanecem no histórico."
          }
          confirmLabel={archiveTarget.type === "check_in" ? "Estornar check-in" : "Retirar projeto"}
          busy={archiveBusy}
          error={archiveError}
          onClose={() => {
            if (archiveBusy) return;
            setArchiveTarget(null);
            setArchiveError(null);
          }}
          onConfirm={archive}
        />
      ) : null}
    </div>
  );
}
