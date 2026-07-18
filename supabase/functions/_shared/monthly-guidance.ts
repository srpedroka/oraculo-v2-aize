import { monthPeriodParts } from "./periods.ts";
import { normalizeMonthlyContinuity } from "./monthly-continuity.ts";

type MonthlyEnvelope = {
  reply?: unknown;
  proposal?: unknown;
};

type MonthlyValidationInput = {
  envelope: MonthlyEnvelope;
  sessionPeriod: string;
  userMessage?: unknown;
};

const ACTIVITY_TITLE_PATTERN = /^(?:implantar|implementar|instalar|criar|fazer|planejar|organizar|contratar|desenvolver|configurar)\b/i;
const RITUAL_SWITCH_PATTERN = /\b(?:vamos|precisamos|vou)\s+(?:construir|montar|fazer|iniciar|come[cç]ar)\s+(?:o\s+)?(?:planejamento|plano)\s+(?:estrat[eé]gico\s+)?(?:anual|trimestral|do trimestre)\b/i;
const PENDING_INPUT_PATTERN = /\b(?:pend[eê]ncia|pendente|rolad[ao]|atras(?:o|ou|ada)|ainda n[aã]o decidi)\b/i;
const PENDING_DECISIONS = new Set(["roll", "renegotiate", "cut", "backlog"]);

export const MONTHLY_GUIDANCE_RULES = `REGRAS ESPECIFICAS DO PLANO MENSAL (obrigatorias):
- O mes executa o trimestre em 1 a 3 resultados mensais. Nunca mude para os rituais anual ou trimestral durante esta sessao.
- Derive o trimestre do mes solicitado, inclusive quando estiver no passado ou futuro. Use automaticamente os objetivos trimestrais ja presentes no contexto; nao peça nova confirmacao de uma base explicita.
- Quando houver objetivo trimestral aplicavel, vincule cada resultado mensal a ele. Quando nao houver, continue no mes somente com quarterlyAlignment={"status":"exception","rationale":"motivo confirmado pelo gestor"}; nunca crie um objetivo trimestral generico para preencher o vinculo.
- Cada resultado mensal preserva title, result, metric, current (baseline), target, source, deadline, owner e o vinculo trimestral real. Cada action preserva description, owner, deadline e completionCriterion.
- Os prazos do objetivo e das acoes devem cair dentro do mes planejado. Se faltar indicador, baseline, alvo, fonte, prazo, dono ou criterio, pergunte somente a lacuna bloqueante.
- O plano inteiro pode comprometer no maximo 5 actions. Se vierem mais itens, ajude a escolher os essenciais e registre o restante em backlog[] com a renuncia ou condicao de retomada visivel.
- Pendencias herdadas nunca entram silenciosamente. Registre cada uma em pendingDecisions[] com item, origin, reason e decision=roll|renegotiate|cut|backlog.
- Preserve risks[], blockers[], cadence e nextCommitment quando informados. A cadencia acompanha o plano sem criar burocracia.
- Se o gestor fornecer um bloco completo, monte a proposta imediatamente. A sintese termina com UMA unica confirmacao para gravar.

Formato completo da proposal mensal:
{"type":"save_monthly_plan","period":"Mai 2027","quarterlyAlignment":{"status":"linked|exception","quarterlyObjectiveId":"","quarterlyObjectiveTitle":"","rationale":""},"capacity":{"maxCommittedActions":5},"pendingDecisions":[{"item":"","origin":"","reason":"","decision":"roll|renegotiate|cut|backlog"}],"backlog":[""],"risks":[""],"blockers":[""],"cadence":"","nextCommitment":"","learningFocus":[],"focusPhrase":"","objectives":[{"title":"","result":"","type":"harvest|seed","metric":"","current":"","target":"","source":"","deadline":"YYYY-MM-DD","owner":"","period":"Mai 2027","linkedQuarterlyObjectiveId":"","parentTitle":"","actions":[{"description":"","owner":"","deadline":"YYYY-MM-DD","completionCriterion":""}],"kpiLinks":[]}]}`;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function objectiveIsVerifiable(objective: Record<string, unknown>) {
  return [
    objective.title ?? objective.titulo,
    objective.result ?? objective.resultado,
    objective.metric ?? objective.indicador,
    objective.current ?? objective.baseline ?? objective.valor_atual,
    objective.target ?? objective.meta,
    objective.source ?? objective.fonte ?? objective.evidencePlan ?? objective.evidence_plan,
    objective.deadline ?? objective.prazo,
    objective.owner ?? objective.responsavel,
  ].every((value) => text(value));
}

function actionIsComplete(action: unknown) {
  const record = asRecord(action);
  return [
    record.description ?? record.descricao,
    record.owner ?? record.responsavel,
    record.deadline ?? record.prazo,
    record.completionCriterion ?? record.completion_criterion ?? record.criterio,
  ].every((value) => text(value));
}

function dateBelongsToMonth(value: unknown, period: string) {
  const parts = monthPeriodParts(period);
  const match = text(value).match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (!parts || !match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day
    && year === parts.year
    && month === parts.month;
}

function objectiveHasQuarterlyLink(objective: Record<string, unknown>) {
  return Boolean(text(
    objective.linkedQuarterlyObjectiveId
      ?? objective.linked_quarterly_objective_id
      ?? objective.parentTitle
      ?? objective.vinculo,
  ));
}

function proposalHasQuarterlyLink(proposal: Record<string, unknown>, alignment: Record<string, unknown>, objectives: unknown[]) {
  return Boolean(
    text(alignment.quarterlyObjectiveId ?? alignment.quarterly_objective_id)
    || text(alignment.quarterlyObjectiveTitle ?? alignment.quarterly_objective_title)
    || (objectives.length > 0 && objectives.every((objective) => objectiveHasQuarterlyLink(asRecord(objective))))
  );
}

function pendingDecisionIsExplicit(value: unknown) {
  const decision = asRecord(value);
  return Boolean(
    text(decision.item ?? decision.pendencia)
    && text(decision.origin ?? decision.origem)
    && text(decision.reason ?? decision.motivo)
    && PENDING_DECISIONS.has(text(decision.decision ?? decision.decisao).toLowerCase())
  );
}

function pendingDecisionOptionCount(value: string) {
  return [
    /\brol(?:ar|a|ado|ada)\b/i,
    /\brenegoci(?:ar|a|ado|ada)\b/i,
    /\b(?:cortar|corta|cancelar|descartar)\b/i,
    /\b(?:backlog|adiar|deixar para depois)\b/i,
  ].filter((pattern) => pattern.test(value)).length;
}

export function validateMonthlyProposal(proposalValue: unknown, sessionPeriod: string) {
  const reasons: string[] = [];
  const proposal = asRecord(normalizeMonthlyContinuity(proposalValue));
  if (!Object.keys(proposal).length) return reasons;
  if (proposal.type !== "save_monthly_plan") return ["monthly_wrong_proposal_type"];

  const objectives = asArray(proposal.objectives ?? proposal.objetivos_mes);
  const alignment = asRecord(proposal.quarterlyAlignment ?? proposal.alinhamento_trimestral);
  const alignmentStatus = text(alignment.status).toLowerCase();
  const proposalPeriod = text(proposal.period ?? proposal.periodo) || sessionPeriod;
  const actions = objectives.flatMap((objective) => asArray(asRecord(objective).actions ?? asRecord(objective).acoes));

  if (!objectives.length) reasons.push("monthly_missing_objectives");
  if (objectives.length > 3) reasons.push("monthly_result_overload");
  if (actions.length > 5) reasons.push("monthly_action_overload");
  if (proposalPeriod.toLowerCase() !== sessionPeriod.toLowerCase()) reasons.push("monthly_wrong_period");
  if (!['linked', 'exception'].includes(alignmentStatus)) reasons.push("monthly_alignment_missing");
  if (alignmentStatus === "linked" && !proposalHasQuarterlyLink(proposal, alignment, objectives)) {
    reasons.push("monthly_alignment_missing");
  }
  if (alignmentStatus === "exception" && !text(alignment.rationale ?? alignment.justificativa)) {
    reasons.push("monthly_alignment_exception_missing_reason");
  }
  if (alignmentStatus === "exception" && proposalHasQuarterlyLink(proposal, alignment, objectives)) {
    reasons.push("monthly_exception_with_quarterly_link");
  }

  for (const rawObjective of objectives) {
    const objective = asRecord(rawObjective);
    const title = text(objective.title ?? objective.titulo);
    const result = text(objective.result ?? objective.resultado);
    const objectivePeriod = text(objective.period ?? objective.periodo) || sessionPeriod;
    const objectiveActions = asArray(objective.actions ?? objective.acoes);
    if (!objectiveIsVerifiable(objective)) reasons.push("monthly_unverifiable_objective");
    if (ACTIVITY_TITLE_PATTERN.test(title) && (!result || ACTIVITY_TITLE_PATTERN.test(result))) {
      reasons.push("monthly_activity_as_result");
    }
    if (!objectiveActions.length || objectiveActions.some((action) => !actionIsComplete(action))) {
      reasons.push("monthly_incomplete_actions");
    }
    if (objectivePeriod.toLowerCase() !== sessionPeriod.toLowerCase()) reasons.push("monthly_wrong_period");
    if (!dateBelongsToMonth(objective.deadline ?? objective.prazo, sessionPeriod)) {
      reasons.push("monthly_deadline_out_of_period");
    }
    if (objectiveActions.some((action) => !dateBelongsToMonth(asRecord(action).deadline ?? asRecord(action).prazo, sessionPeriod))) {
      reasons.push("monthly_action_out_of_period");
    }
  }

  if (asArray(proposal.pendingDecisions ?? proposal.decisoes_pendentes).some((item) => !pendingDecisionIsExplicit(item))) {
    reasons.push("monthly_pending_decision_incomplete");
  }

  return [...new Set(reasons)];
}

export function validateMonthlyGuidanceEnvelope(input: MonthlyValidationInput) {
  const reply = text(input.envelope.reply);
  const reasons = RITUAL_SWITCH_PATTERN.test(reply) ? ["monthly_ritual_switch"] : [];
  if (PENDING_INPUT_PATTERN.test(text(input.userMessage)) && !input.envelope.proposal && pendingDecisionOptionCount(reply) < 2) {
    reasons.push("monthly_pending_without_options");
  }
  return [...new Set([...reasons, ...validateMonthlyProposal(input.envelope.proposal, input.sessionPeriod)])];
}
