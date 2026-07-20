import type { KeyAction, Objective, Status } from "../types";

// Cockpit de execução: "atrasado" é SEMPRE derivado do prazo, nunca lido do
// status salvo (que continua sendo a intenção humana/IA). Só datas parseáveis
// (ISO, como o resto do app grava) entram no cálculo — prazos livres tipo
// "contínuo" nunca são marcados como atrasados.

export type TrackKind = "objective" | "key_action";

export interface TrackItem {
  id: string;
  kind: TrackKind;
  title: string;
  owner: string;
  areaId: string | null;
  deadline: string | null;
  status: Status;
}

export interface TrackSummary {
  total: number;
  withDeadline: number;
  late: number;
  atRisk: number;
  done: number;
  onTrack: number;
  onTimePct: number | null;
}

export interface OwnerGroup {
  owner: string;
  total: number;
  late: number;
  done: number;
  onTimePct: number | null;
}

// Compromissos com prazo que o cockpit acompanha: objetivos datáveis + todas as
// ações-chave (a área da ação vem do objetivo pai).
export function buildTrackItems(objectives: Objective[], keyActions: KeyAction[]): TrackItem[] {
  const objectiveItems: TrackItem[] = objectives
    .filter((objective) => objective.deadline)
    .map((objective) => ({
      id: objective.id,
      kind: "objective",
      title: objective.title,
      owner: objective.owner,
      areaId: objective.areaId,
      deadline: objective.deadline,
      status: objective.status,
    }));

  const actionItems: TrackItem[] = keyActions.map((action) => {
    const parent = objectives.find((objective) => objective.id === action.objectiveId);
    return {
      id: action.id,
      kind: "key_action",
      title: action.description,
      owner: action.owner,
      areaId: parent?.areaId ?? null,
      deadline: action.deadline,
      status: action.status ?? "on_track",
    };
  });

  return [...objectiveItems, ...actionItems];
}

function parseDeadline(deadline: string | null | undefined): Date | null {
  if (!deadline) return null;
  const iso = deadline.includes("T") ? deadline : `${deadline}T00:00:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function isOverdue(item: { deadline: string | null; status?: Status }, now = new Date()): boolean {
  if (item.status === "done") return false;
  const due = parseDeadline(item.deadline);
  if (!due) return false;
  return due.getTime() < startOfToday(now).getTime();
}

export function daysLate(deadline: string | null | undefined, now = new Date()): number | null {
  const due = parseDeadline(deadline);
  if (!due) return null;
  const diff = startOfToday(now).getTime() - due.getTime();
  return diff <= 0 ? 0 : Math.floor(diff / 86_400_000);
}

export function derivedStatus(item: { deadline: string | null; status?: Status }, now = new Date()): Status {
  if (item.status === "done") return "done";
  if (isOverdue(item, now)) return "late";
  return item.status ?? "on_track";
}

export function displayStatus(item: { deadline: string | null; status?: Status }, now = new Date()): Status | "unset" {
  const status = derivedStatus(item, now);
  if (status === "on_track" && !parseDeadline(item.deadline)) return "unset";
  return status;
}

const OWNERLESS = "Sem responsável";

function ownerLabel(owner: string): string {
  const trimmed = (owner ?? "").trim();
  return trimmed || OWNERLESS;
}

export function summarize(items: TrackItem[], now = new Date()): TrackSummary {
  let withDeadline = 0;
  let late = 0;
  let atRisk = 0;
  let done = 0;
  let onTrack = 0;

  for (const item of items) {
    const status = derivedStatus(item, now);
    if (parseDeadline(item.deadline)) withDeadline += 1;
    if (status === "done") done += 1;
    else if (status === "late") late += 1;
    else if (status === "at_risk") atRisk += 1;
    else onTrack += 1;
  }

  return {
    total: items.length,
    withDeadline,
    late,
    atRisk,
    done,
    onTrack,
    onTimePct: withDeadline ? (withDeadline - late) / withDeadline : null,
  };
}

export function overdueItems(items: TrackItem[], now = new Date()): TrackItem[] {
  return items
    .filter((item) => isOverdue(item, now))
    .sort((left, right) => (daysLate(right.deadline, now) ?? 0) - (daysLate(left.deadline, now) ?? 0));
}

export function groupByOwner(items: TrackItem[], now = new Date()): OwnerGroup[] {
  const map = new Map<string, OwnerGroup>();
  for (const item of items) {
    const owner = ownerLabel(item.owner);
    const group = map.get(owner) ?? { owner, total: 0, late: 0, done: 0, onTimePct: null };
    const status = derivedStatus(item, now);
    group.total += 1;
    if (status === "late") group.late += 1;
    if (status === "done") group.done += 1;
    map.set(owner, group);
  }
  const groups = [...map.values()].map((group) => ({
    ...group,
    onTimePct: group.total ? (group.total - group.late) / group.total : null,
  }));
  return groups.sort((left, right) => right.late - left.late || right.total - left.total);
}
