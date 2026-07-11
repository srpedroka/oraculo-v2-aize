import type { Objective, PlanLevel } from "../types";

export type ConcretenessRange = "Direcional" | "Em forma" | "Concreto";

export interface ConcretenessSignal {
  key: "result" | "deadline" | "owner" | "linkage" | "evidence";
  label: string;
  met: boolean;
  invitation: string;
}

export interface ConcretenessResult {
  score: number;
  range: ConcretenessRange;
  signals: ConcretenessSignal[];
  met: ConcretenessSignal[];
  missing: ConcretenessSignal[];
  firstMissing: ConcretenessSignal | null;
  recommendedMinimum: number;
  belowRecommended: boolean;
}

const RESULT_VERBS = [
  "aumentar",
  "reduzir",
  "fechar",
  "entregar",
  "implantar",
  "atingir",
  "lançar",
  "concluir",
  "publicar",
  "validar",
  "conquistar",
  "eliminar",
  "manter",
  "sustentar",
  "formar",
  "mapear",
  "padronizar",
];

const INVITATIONS: Record<ConcretenessSignal["key"], string> = {
  result:
    "Dá para deixar isso mais concreto. Qual é o resultado observável? Número, percentual ou um verbo de entrega.",
  deadline: "Quer marcar um prazo? Ajuda a cobrar depois.",
  owner: "Quem você colocaria como responsável? Pode ajustar depois.",
  linkage: "De qual objetivo do nível acima este puxa? Se quiser, ligo agora.",
  evidence: "Que evidência vai provar que avançou? Vale definir agora, mas pode salvar e voltar.",
};

export function hasObservableResult(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  const hasNumber = /\d|r\$\s?\d|%/.test(normalized);
  const hasVerb = RESULT_VERBS.some((verb) => normalized.includes(verb));
  return hasNumber || hasVerb;
}

export function getRange(score: number): ConcretenessRange {
  if (score <= 2) return "Direcional";
  if (score <= 4) return "Em forma";
  return "Concreto";
}

export function recommendedMinimumFor(level: PlanLevel) {
  if (level === "strategic") return 0;
  if (level === "area_annual") return 3;
  return 5;
}

export function evaluateConcreteness(objective: Pick<Objective, "level" | "result" | "deadline" | "owner" | "parentId" | "evidencePlan">): ConcretenessResult {
  const strategicLinkageMet = objective.level === "strategic";
  const signals: ConcretenessSignal[] = [
    {
      key: "result",
      label: "Resultado observável",
      met: hasObservableResult(objective.result),
      invitation: INVITATIONS.result,
    },
    {
      key: "deadline",
      label: "Prazo",
      met: Boolean(objective.deadline),
      invitation: INVITATIONS.deadline,
    },
    {
      key: "owner",
      label: "Responsável",
      met: Boolean(objective.owner.trim()),
      invitation: INVITATIONS.owner,
    },
    {
      key: "linkage",
      label: "Vínculo",
      met: strategicLinkageMet || Boolean(objective.parentId),
      invitation: INVITATIONS.linkage,
    },
    {
      key: "evidence",
      label: "Evidência definida",
      met: Boolean(objective.evidencePlan.trim()),
      invitation: INVITATIONS.evidence,
    },
  ];
  const met = signals.filter((signal) => signal.met);
  const missing = signals.filter((signal) => !signal.met);
  const score = met.length;
  const recommendedMinimum = recommendedMinimumFor(objective.level);

  return {
    score,
    range: getRange(score),
    signals,
    met,
    missing,
    firstMissing: missing[0] ?? null,
    recommendedMinimum,
    belowRecommended: score < recommendedMinimum,
  };
}

export function getConcretenessTone(level: PlanLevel, missingInvitation?: string | null) {
  if (!missingInvitation) return "Objetivo concreto. Agora é acompanhar evidência.";
  if (level === "strategic") return `${missingInvitation} No estratégico, direção boa já ajuda; dá para lapidar depois.`;
  if (level === "area_annual") return `${missingInvitation} Aqui vale mirar em forma: origem, dono e meta clara.`;
  if (level === "quarterly") return `${missingInvitation} No trimestre, quanto mais claro o marco, melhor a cobrança.`;
  return `${missingInvitation} No mensal, ação com nome e data deixa a execução leve para o time.`;
}
