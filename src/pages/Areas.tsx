import { Archive, ArrowRight, CalendarRange, Plus, RotateCcw, ShieldCheck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { StatusBadge } from "../components/ui/StatusBadge";
import { AreaArchiveDialog } from "../features/areas/AreaArchiveDialog";
import { useAppState } from "../state/store";
import type { Area, PlanLevel, Status } from "../types";

function levelCount(level: PlanLevel, count: number) {
  const label =
    level === "area_annual"
      ? "Anual"
      : level === "quarterly"
        ? "Trimestral"
        : level === "monthly"
          ? "Mensal"
          : "Estratégico";
  return `${count} ${label}`;
}

export function Areas() {
  const { state, dispatch } = useAppState();
  const [areaName, setAreaName] = useState("");
  const [areaCoordinatorId, setAreaCoordinatorId] = useState("");
  const [areaToArchive, setAreaToArchive] = useState<Area | null>(null);
  const [areaBusy, setAreaBusy] = useState(false);
  const [areaError, setAreaError] = useState("");
  const [areaMessage, setAreaMessage] = useState("");
  const isOwner = state.currentMembership?.role === "owner";
  const coordinators = useMemo(
    () => state.memberships.filter((membership) => membership.role === "coordinator"),
    [state.memberships],
  );

  function createArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!areaName.trim() || !isOwner) return;
    dispatch({ type: "create_area", name: areaName.trim(), coordinatorId: areaCoordinatorId || null });
    setAreaName("");
    setAreaCoordinatorId("");
  }

  const archiveImpact = useMemo(() => {
    if (!areaToArchive) return { objectives: 0, documents: 0, checkIns: 0 };
    return {
      objectives: state.objectives.filter((objective) => objective.areaId === areaToArchive.id).length,
      documents: state.planDocuments.filter((document) => document.areaId === areaToArchive.id).length,
      checkIns: state.checkIns.filter((checkIn) => checkIn.areaId === areaToArchive.id).length,
    };
  }, [areaToArchive, state.checkIns, state.objectives, state.planDocuments]);

  function archiveArea() {
    if (!areaToArchive) return;
    setAreaBusy(true);
    setAreaError("");
    dispatch({
      type: "archive_area",
      areaId: areaToArchive.id,
      onSuccess: () => {
        setAreaBusy(false);
        setAreaMessage(`${areaToArchive.name} foi arquivada. O histórico continua disponível.`);
        setAreaToArchive(null);
      },
      onError: (message) => {
        setAreaBusy(false);
        setAreaError(message);
      },
    });
  }

  function restoreArea(area: Area) {
    setAreaMessage("");
    dispatch({
      type: "restore_area",
      areaId: area.id,
      onSuccess: () => setAreaMessage(`${area.name} voltou para a operação.`),
      onError: (message) => setAreaMessage(message),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text-tertiary">Áreas da {state.organization?.name}</p>
          <h1 className="text-2xl font-semibold text-text">Áreas</h1>
        </div>
        {!isOwner ? (
          <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary shadow-card">
            <ShieldCheck className="h-4 w-4" />
            Somente leitura
          </div>
        ) : null}
      </div>

      {isOwner ? (
        <Card>
          <form onSubmit={createArea} className="grid gap-3 lg:grid-cols-[1fr_260px_auto]">
            <input
              value={areaName}
              onChange={(event) => setAreaName(event.target.value)}
              placeholder="Nova área ou departamento"
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            />
            <select
              value={areaCoordinatorId}
              onChange={(event) => setAreaCoordinatorId(event.target.value)}
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
            >
              <option value="">Sem coordenador</option>
              {coordinators.map((membership) => (
                <option key={membership.id} value={membership.id}>
                  {membership.profile?.fullName ?? membership.userId}
                </option>
              ))}
            </select>
            <Button type="submit" icon={Plus} disabled={!areaName.trim()}>
              Criar área
            </Button>
          </form>
        </Card>
      ) : null}

      {areaMessage ? <p className="text-sm text-text-secondary">{areaMessage}</p> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {!state.areas.length ? (
          <Card className="xl:col-span-2">
            <p className="text-base font-semibold text-text">Nenhuma área cadastrada.</p>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              {isOwner
                ? "Cadastre a primeira área acima para começar a criar objetivos anuais, trimestrais e mensais."
                : "O dono da empresa precisa cadastrar as áreas antes dos planos trimestrais aparecerem aqui."}
            </p>
          </Card>
        ) : null}
        {state.areas.map((area) => {
          const plan = state.areaPlans.find((item) => item.areaId === area.id);
          const areaObjectives = state.objectives.filter((objective) => objective.areaId === area.id);
          const executionObjectives = areaObjectives.filter((objective) => ["quarterly", "monthly"].includes(objective.level));
          const counts = executionObjectives.reduce<Record<Status, number>>(
            (acc, objective) => ({ ...acc, [objective.status]: acc[objective.status] + 1 }),
            { on_track: 0, at_risk: 0, late: 0, done: 0 },
          );
          const annualCount = areaObjectives.filter((objective) => objective.level === "area_annual").length;
          const quarterlyCount = areaObjectives.filter((objective) => objective.level === "quarterly").length;
          const monthlyCount = areaObjectives.filter((objective) => objective.level === "monthly").length;
          const linkedStrategic = plan?.linkedStrategicObjectiveIds
            .map((id) => state.objectives.find((objective) => objective.id === id)?.title)
            .filter(Boolean);

          return (
            <Card key={area.id} interactive className="flex h-full flex-col gap-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-text-tertiary">Área</p>
                  <h2 className="mt-1 text-lg font-semibold text-text">{area.name}</h2>
                  <p className="mt-1 text-sm text-text-secondary">Coordenador: {area.coordinator}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {counts.on_track ? <StatusBadge status="on_track" /> : null}
                  {counts.at_risk ? <StatusBadge status="at_risk" /> : null}
                  {counts.late ? <StatusBadge status="late" /> : null}
                  {counts.done ? <StatusBadge status="done" /> : null}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-[#FAFAFB] p-4">
                <p className="text-xs font-medium text-text-tertiary">Papel da área</p>
                <p className="mt-1 text-sm leading-6 text-text-secondary">{plan?.role.mission || "Ainda sem papel definido."}</p>
              </div>

              {isOwner ? (
                <div className="flex items-end gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="mb-2 block text-xs font-medium text-text-tertiary">Coordenador</span>
                    <select
                      value={area.coordinatorId ?? ""}
                      onChange={(event) =>
                        dispatch({ type: "update_area", areaId: area.id, name: area.name, coordinatorId: event.target.value || null })
                      }
                      className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm"
                    >
                      <option value="">Sem coordenador</option>
                      {coordinators.map((membership) => (
                        <option key={membership.id} value={membership.id}>
                          {membership.profile?.fullName ?? membership.userId}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    variant="quiet"
                    size="icon"
                    icon={Archive}
                    onClick={() => {
                      setAreaError("");
                      setAreaToArchive(area);
                    }}
                    aria-label={`Arquivar ${area.name}`}
                    title={`Arquivar ${area.name}`}
                  />
                </div>
              ) : null}

              <div>
                <p className="mb-2 text-xs font-medium text-text-tertiary">Puxa da estratégia</p>
                <div className="flex flex-wrap gap-2">
                  {linkedStrategic?.map((title) => (
                    <span key={title} className="rounded-[10px] bg-[#F0F0F2] px-2.5 py-1 text-xs font-medium text-text-secondary">
                      {title}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-[10px] bg-[#F0F7FF] px-2.5 py-1 text-xs font-medium text-accent">
                  {levelCount("area_annual", annualCount)}
                </span>
                <span className="rounded-[10px] bg-[#F0F7FF] px-2.5 py-1 text-xs font-medium text-accent">
                  {levelCount("quarterly", quarterlyCount)}
                </span>
                <span className="rounded-[10px] bg-[#F0F7FF] px-2.5 py-1 text-xs font-medium text-accent">
                  {levelCount("monthly", monthlyCount)}
                </span>
              </div>

              <div className="mt-auto flex flex-wrap gap-2">
                <Link
                  to={`/areas/${area.id}`}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[#1D1D1F] bg-[#1D1D1F] px-4 text-sm font-medium text-white transition hover:bg-black"
                >
                  Abrir área
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/planos-trimestrais"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-border bg-transparent px-4 text-sm font-medium text-text transition hover:border-accent/30 hover:bg-white"
                >
                  <CalendarRange className="h-4 w-4" />
                  Ver trimestral
                </Link>
              </div>
            </Card>
          );
        })}
      </div>

      {isOwner && state.archivedAreas.length ? (
        <section className="border-t border-border pt-5">
          <div className="mb-3">
            <p className="text-xs font-medium text-text-tertiary">Histórico</p>
            <h2 className="mt-1 text-base font-semibold text-text">Áreas arquivadas</h2>
          </div>
          <div className="divide-y divide-border border-y border-border">
            {state.archivedAreas.map((area) => (
              <div key={area.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-text">{area.name}</p>
                  <p className="mt-1 text-xs text-text-secondary">Planos e registros preservados</p>
                </div>
                <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => restoreArea(area)}>
                  Restaurar
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {areaToArchive ? (
        <AreaArchiveDialog
          area={areaToArchive}
          impact={archiveImpact}
          busy={areaBusy}
          error={areaError}
          onClose={() => {
            if (areaBusy) return;
            setAreaToArchive(null);
            setAreaError("");
          }}
          onConfirm={archiveArea}
        />
      ) : null}
    </div>
  );
}
