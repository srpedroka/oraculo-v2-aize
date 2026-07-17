type SessionEnvelope = {
  reply?: unknown;
  state_patch?: unknown;
  next_phase?: unknown;
  proposal?: unknown;
};

type AdaptiveMetadata = {
  readiness: "vague" | "partial" | "ready";
  confirmed_facts: string[];
  blocking_gap: string | null;
  question_goal: string | null;
  action_direction: string | null;
};

type ValidationInput = {
  envelope: SessionEnvelope;
  currentPhase: string;
  phases: string[];
  sessionState?: unknown;
  previousOracleReply: string;
  userMessage: string;
};

const TECHNICAL_STATE_PATTERN = /\b(?:base_confirmada|state_patch|next_phase|pending_proposal|proposal)\b|\bfase\s+(?:abertura|alinhamento|diagnostico|síntese|sintese)\b/i;
const COMPLETION_REQUEST_PATTERN = /\b(?:considere tudo|dados (?:sao|são|estao|estão) suficientes|apresente (?:agora )?(?:a )?(?:sintese|síntese|proposta)|proposta final|pode gerar|pode montar|ja informei|já informei)\b/i;
const GENERIC_OPENING_PATTERN = /\bqual (?:e|é|seria) (?:a |o )?principal (?:dor|desafio|resultado)\b/i;
const FACT_SIGNALS = [
  /\bobjetiv[oa]s?\b/i,
  /\bmeta\b|\balvo\b|\bbaseline\b/i,
  /\bprazo\b|\bate\b|\baté\b/i,
  /\brespons[aá]vel\b|\bdono\b/i,
  /\bfonte\b|\bevid[eê]ncia\b|\bcrit[eé]rio\b/i,
  /\ba[cç][aã]o\b|\bentrega\b|\bprojeto\b/i,
  /\brisco\b|\bbloqueio\b|\bgargalo\b/i,
  /\bperiodo\b|\bper[ií]odo\b|\btrimestre\b|\bm[eê]s\b/i,
];

const REPAIR_REASON_LABELS: Record<string, string> = {
  invalid_json_envelope: "o envelope JSON ficou invalido",
  missing_adaptive_state: "faltou classificar internamente a prontidao da sessao",
  fact_block_misclassified: "um bloco rico em fatos foi tratado como resposta vaga",
  repeated_question: "a pergunta repete semanticamente a pergunta anterior",
  multiple_questions: "ha mais de uma pergunta visivel",
  missing_next_question: "faltou uma unica pergunta que destrave a proxima decisao",
  vague_without_options: "a resposta vaga nao recebeu duas ou tres possibilidades concretas",
  technical_state_leak: "o texto visivel expoe estado ou nome tecnico interno",
  backward_phase: "a resposta tenta voltar para uma fase anterior",
  ready_without_proposal: "a sessao foi marcada como pronta, mas nao trouxe a proposta final",
  proposal_before_ready: "uma proposta foi criada antes de a sessao estar pronta",
  ready_with_blocking_gap: "a sessao foi marcada como pronta e com lacuna bloqueante ao mesmo tempo",
  incomplete_adaptive_state: "a classificacao interna nao informou lacuna, objetivo e direcao de acao",
  unverified_confirmed_facts: "os fatos declarados como confirmados nao existem no estado canonico da sessao",
  phase_advance_without_evidence: "a resposta avancou de fase sem registrar nenhum fato novo",
  ignored_completion_request: "o gestor pediu sintese, mas recebeu de novo uma pergunta generica",
  proposal_confirmation_count: "a proposta nao termina com exatamente uma confirmacao",
  quarterly_annual_ritual_switch: "o plano trimestral tentou mudar indevidamente para o ritual anual",
  quarterly_wrong_proposal_type: "a proposta nao e do tipo trimestral esperado",
  quarterly_missing_objectives: "a proposta trimestral nao possui resultado priorizado",
  quarterly_priority_overload: "a proposta trimestral excede o limite de tres resultados decisivos",
  quarterly_alignment_missing: "faltou vinculo anual real ou excecao anual explicita",
  quarterly_alignment_exception_missing_reason: "a excecao ao alinhamento anual ficou sem justificativa",
  quarterly_exception_with_annual_link: "a proposta declarou excecao anual e vinculo anual ao mesmo tempo",
  quarterly_unverifiable_objective: "um objetivo trimestral nao preservou indicador, baseline, alvo, fonte, prazo, dono e resultado",
  quarterly_activity_as_objective: "uma atividade foi tratada como resultado final do trimestre",
  quarterly_incomplete_actions: "faltou ao menos uma acao com dono, prazo e criterio de conclusao",
  monthly_ritual_switch: "o plano mensal tentou mudar indevidamente para o ritual anual ou trimestral",
  monthly_wrong_proposal_type: "a proposta nao e do tipo mensal esperado",
  monthly_missing_objectives: "a proposta mensal nao possui resultado priorizado",
  monthly_result_overload: "a proposta mensal excede o limite de tres resultados",
  monthly_action_overload: "a proposta mensal excede cinco acoes comprometidas no total",
  monthly_wrong_period: "o periodo da proposta nao corresponde ao mes planejado",
  monthly_alignment_missing: "faltou vinculo trimestral real ou excecao trimestral explicita",
  monthly_alignment_exception_missing_reason: "a excecao ao alinhamento trimestral ficou sem justificativa",
  monthly_exception_with_quarterly_link: "a proposta declarou excecao e vinculo trimestral ao mesmo tempo",
  monthly_unverifiable_objective: "um resultado mensal nao preservou indicador, baseline, alvo, fonte, prazo, dono e resultado",
  monthly_activity_as_result: "uma atividade foi tratada como resultado final do mes",
  monthly_incomplete_actions: "faltou ao menos uma acao mensal com dono, prazo e criterio de conclusao",
  monthly_deadline_out_of_period: "o prazo do resultado ficou fora do mes planejado",
  monthly_action_out_of_period: "o prazo de uma acao ficou fora do mes planejado",
  monthly_pending_decision_incomplete: "uma pendencia herdada ficou sem origem, motivo ou decisao explicita",
  monthly_pending_without_options: "uma pendencia indecisa nao recebeu opcoes de rolar, renegociar, cortar ou enviar ao backlog",
};

export const ADAPTIVE_SESSION_RULES = `CONTRATO DE CONDUCAO ADAPTATIVA (obrigatorio):
- As fases sao um checklist de decisoes, nao um formulario por turnos. Absorva TODOS os fatos da mensagem atual e do historico; pule qualquer fase ja satisfeita e use next_phase para ir direto a primeira lacuna real, inclusive sintese.
- Cada state_patch deve incluir _adaptive no formato {"readiness":"vague|partial|ready","confirmed_facts":[""],"blocking_gap":string|null,"question_goal":string|null,"action_direction":string|null}. confirmed_facts lista somente CHAVES DE TOPO exatas do estado ja coletado ou do state_patch que tenham valor concreto; o servidor valida essas chaves. Esse bloco e interno e nunca aparece em reply.
- Use readiness=vague quando ainda faltam escolhas basicas; partial quando existe uma lacuna realmente bloqueante; ready somente quando a proposal completa pode ser criada agora.
- Se a resposta for vaga, reconheca o que foi dito e ofereca 2 ou 3 possibilidades curtas dentro de UMA pergunta neutra. Nao escolha pela pessoa.
- Se a resposta for parcial, faca somente a pergunta da lacuna bloqueante. Cite o fato que motivou a pergunta e a decisao ou acao que ela destrava.
- Se a resposta estiver pronta, monte a proposal na mesma resposta e peça UMA unica confirmacao. Nao pergunte se a pessoa quer resumo, proposta ou proxima etapa.
- Nunca repita semanticamente a ultima pergunta do Oraculo. Nunca exponha nomes de fase, _adaptive, base_confirmada, state_patch, next_phase ou a palavra tecnica proposal.
- Fora de resumos finais, reply deve ter de 1 a 3 frases, em tom casual, tranquilo e objetivo. Toda pergunta precisa aproximar resultado, escolha, meta ou proxima acao executavel.`;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeForComparison(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function questionTokens(value: string) {
  return new Set(normalizeForComparison(value).split(" ").filter((token) => token.length > 1));
}

function questionsAreSimilar(left: string, right: string) {
  const normalizedLeft = normalizeForComparison(left);
  const normalizedRight = normalizeForComparison(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  if (Math.min(normalizedLeft.length, normalizedRight.length) >= 24 &&
    (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))) return true;

  const leftTokens = questionTokens(left);
  const rightTokens = questionTokens(right);
  if (!leftTokens.size || !rightTokens.size) return false;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const containment = intersection / Math.min(leftTokens.size, rightTokens.size);
  const jaccard = intersection / union;
  return containment >= 0.82 && jaccard >= 0.62;
}

export function visibleQuestions(value: string) {
  return [...value.matchAll(/([^?]+\?)/g)]
    .map((match) => {
      const block = match[1].replace(/^[\s\-*>#]+/, "").trim();
      return block
        .split(/(?:[.!]\s+|\n+|:\s+)/)
        .map((part) => part.trim())
        .filter(Boolean)
        .at(-1) ?? block;
    })
    .filter(Boolean);
}

export function lastVisibleQuestion(value: string) {
  return visibleQuestions(value).at(-1) ?? "";
}

export function repeatsPreviousQuestion(reply: string, previousOracleReply: string) {
  const current = lastVisibleQuestion(reply);
  const previous = lastVisibleQuestion(previousOracleReply);
  return Boolean(current && previous && questionsAreSimilar(current, previous));
}

export function looksLikeFactBlock(value: string) {
  const bulletCount = value.split("\n").filter((line) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(line)).length;
  const signalCount = FACT_SIGNALS.filter((pattern) => pattern.test(value)).length;
  return bulletCount >= 3 || signalCount >= 4 || (value.length >= 420 && signalCount >= 2);
}

function adaptiveMetadata(envelope: SessionEnvelope): AdaptiveMetadata | null {
  const statePatch = asRecord(envelope.state_patch);
  const adaptive = asRecord(statePatch._adaptive);
  const readiness = text(adaptive.readiness);
  if (!(["vague", "partial", "ready"] as string[]).includes(readiness)) return null;
  return {
    readiness: readiness as AdaptiveMetadata["readiness"],
    confirmed_facts: Array.isArray(adaptive.confirmed_facts)
      ? adaptive.confirmed_facts.map(text).filter(Boolean)
      : [],
    blocking_gap: adaptive.blocking_gap == null ? null : text(adaptive.blocking_gap).slice(0, 240) || null,
    question_goal: adaptive.question_goal == null ? null : text(adaptive.question_goal).slice(0, 240) || null,
    action_direction: adaptive.action_direction == null ? null : text(adaptive.action_direction).slice(0, 240) || null,
  };
}

function hasGuidedOptions(reply: string) {
  return /\b(?:ou|entre)\b/i.test(reply) || /(?:^|\n)\s*(?:1[.)]|[-*•]).*(?:\n|$)/.test(reply);
}

function isPause(statePatch: unknown) {
  return asRecord(statePatch).pausa_solicitada === true;
}

function hasConcreteValue(value: unknown) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(asRecord(value)).length > 0;
  return true;
}

function mergedCanonicalState(sessionState: unknown, statePatch: unknown) {
  return { ...asRecord(sessionState), ...asRecord(statePatch) };
}

function verifiedStateKeys(sessionState: unknown, statePatch: unknown) {
  const merged = mergedCanonicalState(sessionState, statePatch);
  return Object.keys(merged).filter((key) => key !== "_adaptive" && hasConcreteValue(merged[key]));
}

export function validateAdaptiveEnvelope(input: ValidationInput) {
  const reasons: string[] = [];
  const reply = text(input.envelope.reply);
  const questions = visibleQuestions(reply);
  const metadata = adaptiveMetadata(input.envelope);
  const hasProposal = Boolean(input.envelope.proposal);
  const paused = isPause(input.envelope.state_patch);
  const canonicalState = mergedCanonicalState(input.sessionState, input.envelope.state_patch);
  const newStateKeys = verifiedStateKeys({}, input.envelope.state_patch);

  if (!metadata) reasons.push("missing_adaptive_state");
  if (metadata && (
    (metadata.readiness !== "ready" && (!metadata.blocking_gap || !metadata.question_goal || !metadata.action_direction))
    || (metadata.readiness === "ready" && (!metadata.question_goal || !metadata.action_direction))
  )) {
    reasons.push("incomplete_adaptive_state");
  }
  if (metadata?.confirmed_facts.some((key) => key === "_adaptive" || !hasConcreteValue(canonicalState[key]))) {
    reasons.push("unverified_confirmed_facts");
  }
  if (metadata?.readiness === "vague" && looksLikeFactBlock(input.userMessage)) reasons.push("fact_block_misclassified");
  if (repeatsPreviousQuestion(reply, input.previousOracleReply)) reasons.push("repeated_question");
  if (questions.length > 1) reasons.push("multiple_questions");
  if (!hasProposal && !paused && questions.length === 0) reasons.push("missing_next_question");
  if (metadata?.readiness === "vague" && questions.length === 1 && !hasGuidedOptions(reply)) reasons.push("vague_without_options");
  if (TECHNICAL_STATE_PATTERN.test(reply)) reasons.push("technical_state_leak");

  const currentIndex = input.phases.indexOf(input.currentPhase);
  const nextIndex = input.phases.indexOf(text(input.envelope.next_phase));
  if (currentIndex >= 0 && nextIndex >= 0 && nextIndex < currentIndex) reasons.push("backward_phase");
  if (currentIndex >= 0 && nextIndex > currentIndex && newStateKeys.length === 0 && !hasProposal) {
    reasons.push("phase_advance_without_evidence");
  }
  if (metadata?.readiness === "ready" && metadata.blocking_gap) reasons.push("ready_with_blocking_gap");
  if (metadata?.readiness === "ready" && !hasProposal) reasons.push("ready_without_proposal");
  if (hasProposal && metadata?.readiness !== "ready") reasons.push("proposal_before_ready");
  if (COMPLETION_REQUEST_PATTERN.test(input.userMessage) && !hasProposal && GENERIC_OPENING_PATTERN.test(reply)) {
    reasons.push("ignored_completion_request");
  }
  if (hasProposal && questions.length !== 1) reasons.push("proposal_confirmation_count");

  return [...new Set(reasons)];
}

export function latestOracleReply(messages: Array<{ author?: unknown; text?: unknown }>) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.author === "oracle") return text(messages[index]?.text);
  }
  return "";
}

export function buildAdaptiveRepairDirective(reasons: string[], rejectedReply: string) {
  const labels = reasons.map((reason) => `- ${REPAIR_REASON_LABELS[reason] ?? reason}`).join("\n");
  return `CORRECAO INTERNA OBRIGATORIA:
A resposta anterior foi recusada antes de chegar ao gestor:
${labels}

Trecho recusado: ${text(rejectedReply).replace(/\s+/g, " ").slice(0, 900) || "envelope invalido"}

Gere novamente o objeto JSON completo. Releia todas as mensagens, absorva os fatos ja fornecidos, avance para a primeira lacuna real ou monte a proposta se estiver pronta. Nao mencione esta correcao ao gestor.`;
}

export function safeAdaptiveNextPhase(currentPhase: string, requestedPhase: unknown, phases: string[], reasons: string[]) {
  const currentIndex = phases.indexOf(currentPhase);
  const requested = text(requestedPhase);
  const requestedIndex = phases.indexOf(requested);
  if (reasons.includes("phase_advance_without_evidence")) return currentPhase;
  if (currentIndex >= 0 && requestedIndex >= 0 && requestedIndex < currentIndex) return currentPhase;
  return requested || currentPhase;
}

export function ensureAdaptiveStatePatch(
  statePatch: unknown,
  userMessage: string,
  hasProposal: boolean,
  force = false,
  sessionState: unknown = {},
) {
  const patch = asRecord(statePatch);
  if (!force && adaptiveMetadata({ state_patch: patch })) return patch;
  return {
    ...patch,
    _adaptive: {
      readiness: hasProposal ? "ready" : looksLikeFactBlock(userMessage) ? "partial" : "vague",
      confirmed_facts: verifiedStateKeys(sessionState, patch),
      blocking_gap: hasProposal ? null : "proxima decisao executavel",
      question_goal: hasProposal ? "confirmar gravacao" : "identificar a proxima decisao executavel",
      action_direction: hasProposal ? "gravar o plano confirmado" : "transformar a resposta em acao",
    },
  };
}

export function adaptiveFallbackReply(hasProposal: boolean, paused: boolean, reasons: string[] = []) {
  if (paused) return "Tudo bem. A sessão fica salva e a gente retoma daqui quando você quiser.";
  if (hasProposal) return "Organizei o que você trouxe e deixei a proposta pronta, sem repetir etapas. Confirma a gravação?";
  if (reasons.includes("monthly_pending_without_options")) {
    return "Essa pendência precisa de um destino claro para não entrar silenciosamente em maio. Você prefere rolar com um novo prazo, renegociar, cortar ou deixar no backlog?";
  }
  return "Você já trouxe informação suficiente para eu não repetir a etapa anterior. Entre o resultado, o prazo, o responsável ou a primeira ação, qual ponto ainda precisa ser decidido para seguirmos?";
}
