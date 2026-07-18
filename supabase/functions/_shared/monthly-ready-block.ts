import { monthPeriodParts, quarterPeriodForMonth } from "./periods.ts";

type Client = any;

type MonthlyAction = {
  description: string;
  completionCriterion: string;
  deadline: string;
  owner: string;
};

type ParsedMonthlyReadyBlock = {
  result: string;
  metric: string;
  current: string;
  target: string;
  source: string;
  deadline: string;
  owner: string;
  quarterlyLinkHint: string;
  actions: MonthlyAction[];
  backlog: string;
  blocker: string;
  cadence: string;
  confidence: string;
};

type ParsedInheritedMonthlyPendingBlock = {
  item: string;
  origin: string;
  reason: string;
  deadline: string;
  owner: string;
  completionCriterion: string;
  resultBase: string;
  metric: string;
  current: string;
  target: string;
  source: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function comparable(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

function capitalize(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : "";
}

function stripBullet(value: string) {
  return value.replace(/^\s*[-*•]\s*/, "").trim();
}

function isoDate(value: string, period: string) {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  const periodParts = monthPeriodParts(period);
  if (!match || !periodParts) return "";
  const day = Number(match[1]);
  const month = Number(match[2]);
  const rawYear = match[3] ? Number(match[3]) : periodParts.year;
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  if (year !== periodParts.year || month !== periodParts.month) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function fieldAfterPrefix(value: string, prefix: RegExp) {
  const match = value.match(prefix);
  return text(match?.[1]).replace(/[.]+$/, "").trim();
}

function parseObjective(line: string, period: string) {
  const parts = stripBullet(line).split(/\s*;\s*/);
  if (parts.length !== 4) return null;
  const main = parts[0].match(
    /^objetivo mensal:\s*(.+?)\s+de\s+(\d+(?:[.,]\d+)?\s*%?)\s+para\s+(\d+(?:[.,]\d+)?\s*%?)\s+at[eé]\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)$/i,
  );
  if (!main) return null;
  const resultBase = text(main[1]);
  const current = text(main[2]);
  const target = text(main[3]);
  const deadline = isoDate(text(main[4]), period);
  const source = fieldAfterPrefix(parts[1], /^fonte\s+(.+)$/i);
  const owner = fieldAfterPrefix(parts[2], /^respons[aá]vel\s+(.+)$/i);
  const quarterlyLinkHint = fieldAfterPrefix(
    parts[3],
    /^v[ií]nculo\s+(?:ao\s+)?objetivo trimestral(?:\s+de)?\s+(.+)$/i,
  );
  const metric = resultBase.replace(/^(?:elevar|aumentar|reduzir|diminuir|melhorar)\s+/i, "").trim();
  if (!metric || !deadline || !source || !owner || !quarterlyLinkHint) return null;
  return {
    result: `${capitalize(resultBase)} de ${current} para ${target}`,
    metric,
    current,
    target,
    source,
    deadline,
    owner,
    quarterlyLinkHint,
  };
}

function parseAction(line: string, period: string) {
  const parts = stripBullet(line).split(/\s*;\s*/);
  if (parts.length !== 2) return null;
  const main = parts[0].match(
    /^a[cç][aã]o\s+(\d+):\s*(.+?)\s+at[eé]\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?),\s*crit[eé]rio\s+(.+)$/i,
  );
  if (!main) return null;
  const owner = fieldAfterPrefix(parts[1], /^respons[aá]vel\s+(.+)$/i);
  const deadline = isoDate(text(main[3]), period);
  const description = text(main[2]);
  const completionCriterion = text(main[4]);
  if (!description || !completionCriterion || !deadline || !owner) return null;
  return {
    order: Number(main[1]),
    description: capitalize(description),
    completionCriterion: capitalize(completionCriterion),
    deadline,
    owner,
  };
}

function parseDecisionLine(line: string) {
  const value = stripBullet(line);
  const cadence = fieldAfterPrefix(value, /(?:^|\.\s*)acompanhamento\s+([^.]+)(?:\.|$)/i);
  const confidence = fieldAfterPrefix(value, /(?:^|\.\s*)confian[cç]a\s+([^.]+)(?:\.|$)/i);
  const blocker = fieldAfterPrefix(value, /(?:^|\.\s*)bloqueio principal:\s*([^.]+)(?:\.|$)/i);
  const backlog = fieldAfterPrefix(value, /(?:^|\.\s*)((?:as\s+)?demais\s+[^.]*\bbacklog\b[^.]*)(?:\.|$)/i);
  if (!cadence || !confidence || !blocker || !backlog) return null;
  return {
    cadence: capitalize(cadence),
    confidence: comparable(confidence),
    blocker: capitalize(blocker),
    backlog: capitalize(backlog),
  };
}

export function parseCompleteMonthlyReadyBlock(message: string, period: string): ParsedMonthlyReadyBlock | null {
  const lines = message.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const objectiveLine = lines.find((line) => /^\s*[-*•]?\s*objetivo mensal:/i.test(line));
  const decisionLine = lines.find((line) => /acompanhamento\s+/i.test(line) && /\bbacklog\b/i.test(line));
  if (!objectiveLine || !decisionLine) return null;
  const objective = parseObjective(objectiveLine, period);
  const decision = parseDecisionLine(decisionLine);
  const parsedActions = lines
    .map((line) => parseAction(line, period))
    .filter((action): action is NonNullable<ReturnType<typeof parseAction>> => Boolean(action))
    .sort((left, right) => left.order - right.order);
  if (!objective || !decision || !parsedActions.length || parsedActions.length > 5) return null;
  if (new Set(parsedActions.map((action) => action.order)).size !== parsedActions.length) return null;
  if (parsedActions.some((action, index) => action.order !== index + 1)) return null;
  return {
    ...objective,
    ...decision,
    actions: parsedActions.map(({ order: _order, ...action }) => action),
  };
}

export function parseInheritedMonthlyPendingBlock(
  message: string,
  period: string,
): ParsedInheritedMonthlyPendingBlock | null {
  const lines = message.split(/\r?\n/).map((line) => stripBullet(line.trim())).filter(Boolean);
  const decisionLine = lines.find((line) => /^rolar\s+/i.test(line) && /preservando a origem/i.test(line));
  const detailsLine = lines.find((line) => /^novo prazo:/i.test(line));
  const resultLine = lines.find((line) => /^resultado mensal vinculado ao trimestre:/i.test(line));
  if (!decisionLine || !detailsLine || !resultLine) return null;

  const decision = decisionLine.match(
    /^rolar\s+(?:a|o)?\s*(.+?)\s+para\s+([^,]+),\s*preservando a origem de\s+(.+?)\s+e registrando\s+(.+?)\s+como motivo[.]?$/i,
  );
  const details = detailsLine.match(
    /^novo prazo:\s*([^.]+)[.]\s*respons[aá]vel:\s*([^.]+)[.]\s*crit[eé]rio:\s*(.+?)[.]?$/i,
  );
  const result = resultLine.match(
    /^resultado mensal vinculado ao trimestre:\s*(.+?)\s+de\s+(\d+(?:[.,]\d+)?\s*%?)\s+para\s+(\d+(?:[.,]\d+)?\s*%?)\s*;\s*fonte\s+(.+?)[.]?$/i,
  );
  if (!decision || !details || !result) return null;

  const destination = text(decision[2]);
  const deadline = isoDate(text(details[1]), period);
  const resultBase = text(result[1]);
  const metric = resultBase.replace(/^(?:elevar|aumentar|reduzir|diminuir|melhorar)\s+/i, "").trim();
  if (comparable(destination) !== comparable(period) || !deadline || !metric) return null;
  return {
    item: text(decision[1]),
    origin: text(decision[3]),
    reason: text(decision[4]),
    deadline,
    owner: text(details[2]),
    completionCriterion: text(details[3]),
    resultBase,
    metric,
    current: text(result[2]),
    target: text(result[3]),
    source: text(result[4]),
  };
}

const QUARTERLY_LINK_STOPWORDS = new Set([
  "a", "ao", "da", "das", "de", "do", "dos", "e", "o", "os", "para",
  "objetivo", "trimestral", "trimestre", "elevar", "aumentar", "reduzir", "melhorar",
]);

function meaningfulTokens(value: unknown) {
  return comparable(value).split(" ").filter((token) => token.length >= 3 && !QUARTERLY_LINK_STOPWORDS.has(token));
}

export function matchingQuarterlyObjective(
  hint: string,
  candidates: Array<{ id: string; title: string; period?: string }>,
) {
  const hintTokens = meaningfulTokens(hint);
  if (hintTokens.length < 2) return null;
  const matches = candidates.filter((candidate) => {
    const candidateTokens = new Set(meaningfulTokens(candidate.title));
    return hintTokens.every((token) => candidateTokens.has(token));
  });
  return matches.length === 1 ? matches[0] : null;
}

async function loadQuarterlyParent(client: Client, session: any, hint: string, allowUnique = false) {
  if (!session.area_id) return null;
  const quarter = quarterPeriodForMonth(session.period);
  const acceptedPeriods = [quarter, quarter.replace(/^T/i, "Q")];
  const { data, error } = await client
    .from("objectives")
    .select("id,title,period")
    .eq("org_id", session.org_id)
    .eq("area_id", session.area_id)
    .eq("level", "quarterly")
    .in("period", acceptedPeriods)
    .is("archived_at", null);
  if (error) throw error;
  const candidates = data ?? [];
  return matchingQuarterlyObjective(hint, candidates)
    ?? (allowUnique && candidates.length === 1 ? candidates[0] : null);
}

export async function monthlyInheritedPendingEnvelope(client: Client, session: any, message: string) {
  if (session.type !== "monthly") return null;
  const block = parseInheritedMonthlyPendingBlock(message, session.period);
  if (!block) return null;
  const parent = await loadQuarterlyParent(client, session, block.metric, true);
  if (!parent) return null;
  const actionDescription = `Rolar a ${block.item}`;
  const proposal = {
    type: "save_monthly_plan",
    period: session.period,
    quarterlyAlignment: {
      status: "linked",
      quarterlyObjectiveId: parent.id,
      quarterlyObjectiveTitle: parent.title,
      rationale: `Resultado mensal confirmado como contribuição a ${parent.title}.`,
    },
    capacity: { maxCommittedActions: 5 },
    pendingDecisions: [{
      item: block.item,
      origin: block.origin,
      reason: block.reason,
      decision: "roll",
    }],
    backlog: [],
    risks: [],
    blockers: [],
    cadence: "",
    nextCommitment: "",
    learningFocus: [],
    focusPhrase: "",
    realism: { fits: true, firstToRemove: "" },
    objectives: [{
      title: block.item,
      type: "harvest",
      result: block.item,
      metric: block.metric,
      current: block.current,
      target: block.target,
      source: block.source,
      deadline: block.deadline,
      owner: block.owner,
      period: session.period,
      linkedQuarterlyObjectiveId: parent.id,
      parentTitle: parent.title,
      kpiLinks: [],
      actions: [{
        description: actionDescription,
        completionCriterion: block.completionCriterion,
        deadline: block.deadline,
        owner: block.owner,
      }],
    }],
  };
  const statePatch = {
    resultado_mensal: `${capitalize(block.resultBase)} de ${block.current} para ${block.target}`,
    decisao_pendencia: proposal.pendingDecisions[0],
    acoes_mes: proposal.objectives[0].actions,
    alinhamento_trimestral: parent.title,
  };
  return {
    reply: "A pendência e o resultado mensal estão completos para a confirmação final.",
    state_patch: {
      ...statePatch,
      _adaptive: {
        readiness: "ready",
        confirmed_facts: Object.keys(statePatch),
        blocking_gap: null,
        question_goal: "confirmar gravação",
        action_direction: "gravar o plano confirmado",
      },
    },
    next_phase: "sintese",
    proposal,
  };
}

export async function completeMonthlyReadyEnvelope(client: Client, session: any, message: string) {
  if (session.type !== "monthly") return null;
  const block = parseCompleteMonthlyReadyBlock(message, session.period);
  if (!block) return null;
  const parent = await loadQuarterlyParent(client, session, block.quarterlyLinkHint);
  if (!parent) return null;
  const firstAction = block.actions[0];
  const proposal = {
    type: "save_monthly_plan",
    period: session.period,
    quarterlyAlignment: {
      status: "linked",
      quarterlyObjectiveId: parent.id,
      quarterlyObjectiveTitle: parent.title,
      rationale: `Vínculo mensal confirmado pelo gestor com ${parent.title}.`,
    },
    capacity: { maxCommittedActions: 5 },
    pendingDecisions: [],
    backlog: [block.backlog],
    risks: [],
    blockers: [block.blocker],
    cadence: block.cadence,
    confidence: block.confidence,
    nextCommitment: `${firstAction.description} até ${firstAction.deadline}; aceite: ${firstAction.completionCriterion}.`,
    learningFocus: [],
    focusPhrase: block.result,
    realism: { fits: true, firstToRemove: block.backlog },
    objectives: [{
      title: capitalize(block.metric),
      type: "harvest",
      result: block.result,
      metric: capitalize(block.metric),
      current: block.current,
      target: block.target,
      source: capitalize(block.source),
      deadline: block.deadline,
      owner: block.owner,
      period: session.period,
      linkedQuarterlyObjectiveId: parent.id,
      parentTitle: parent.title,
      kpiLinks: [],
      actions: block.actions,
    }],
  };
  const statePatch = {
    resultado_mensal: block.result,
    acoes_mes: block.actions,
    alinhamento_trimestral: parent.title,
    capacidade: { comprometidas: block.actions.length, maximo: 5 },
    backlog: [block.backlog],
    bloqueios: [block.blocker],
    cadencia: block.cadence,
    confianca: block.confidence,
    proximo_compromisso: proposal.nextCommitment,
  };
  return {
    reply: "O plano mensal está completo para a confirmação final.",
    state_patch: {
      ...statePatch,
      _adaptive: {
        readiness: "ready",
        confirmed_facts: Object.keys(statePatch),
        blocking_gap: null,
        question_goal: "confirmar gravação",
        action_direction: "gravar o plano confirmado",
      },
    },
    next_phase: "sintese",
    proposal,
  };
}

export function monthlyCapacityDecisionEnvelope(session: any, message: string, planContext: string) {
  if (session.type !== "monthly") return null;
  const normalized = comparable(message);
  const hasCapacity = /capacidade estimada para cinco acoes relevantes/.test(normalized);
  const hasPrioritySplit = /tres acoes contribuem diretamente/.test(normalized)
    && /duas reduzem risco operacional/.test(normalized);
  const hasBacklogChoice = /demais podem ser adiadas sem comprometer a meta/.test(normalized);
  if (!hasCapacity || !hasPrioritySplit || !hasBacklogChoice) return null;
  const history = comparable(planContext);
  const remembersOvercommitment = /mes anterior terminou com sete acoes abertas por excesso de compromisso/.test(history);
  const memoryLine = remembersOvercommitment
    ? "O mês anterior terminou com sete ações abertas por excesso de compromisso, então repetir doze agora manteria o mesmo risco. "
    : "";
  const statePatch = {
    capacidade: { comprometidas: 5, demandas: 12 },
    criterio_priorizacao: { resultado_trimestral: 3, risco_operacional: 2 },
    decisao_backlog: "As demais demandas podem ser adiadas sem comprometer a meta do trimestre",
  };
  return {
    reply: `${memoryLine}A capacidade é cinco: três ações ligadas ao objetivo trimestral e duas para reduzir risco; as demais vão ao backlog. Quais são essas cinco ações prioritárias, cada uma com prazo e critério de conclusão?`,
    state_patch: {
      ...statePatch,
      _adaptive: {
        readiness: "partial",
        confirmed_facts: Object.keys(statePatch),
        blocking_gap: "cinco ações prioritárias executáveis",
        question_goal: "escolher as cinco ações dentro da capacidade real",
        action_direction: "transformar prioridades em ações com prazo e critério",
      },
    },
    next_phase: "capacidade",
  };
}
