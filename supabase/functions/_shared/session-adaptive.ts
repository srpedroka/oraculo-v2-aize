import { normalizeQuarterlySharedActions, uniqueQuarterlyActionEntries } from "./quarterly-actions.ts";
import { normalizeQuarterlyKpiLinks, quarterlyKpiLabel, quarterlyKpiLinks } from "./quarterly-kpis.ts";
import { normalizeMonthlyContinuity } from "./monthly-continuity.ts";

type SessionEnvelope = {
  reply?: unknown;
  state_patch?: unknown;
  next_phase?: unknown;
  proposal?: unknown;
  done?: unknown;
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
  sessionType?: string;
  currentPhase: string;
  phases: string[];
  sessionState?: unknown;
  conversationText?: string;
  previousOracleReply: string;
  userMessage: string;
};

const TECHNICAL_STATE_PATTERN = /\b(?:base_confirmada|state_patch|next_phase|pending_proposal|proposal)\b|\bfase\s+(?:abertura|alinhamento|diagnostico|síntese|sintese)\b/i;
const MECHANICAL_ACKNOWLEDGEMENT_PATTERN = /^(?:entendi|perfeito|[oó]timo|boa)[.!,:-]?\s+(?:voc[eê]\s+(?:quer|disse|trouxe)|que\s+)/i;
const BARE_QUESTION_PATTERN = /^(?:qual|quem|quando|como|onde|quanto|o que|existe|h[aá])\b/i;
const ACKNOWLEDGEMENT_PATTERN = /^(entendi|perfeito|[oó]timo|boa|certo|fechado)\b/i;
const STRATEGIC_ACTIVITY_PATTERN = /\b(?:fazer|criar|lan[cç]ar|executar|realizar)\s+(?:um|uma)?\s*(?:campanha|reuni[aã]o|treinamento|evento|pesquisa|relat[oó]rio|projeto)\b/i;
const STRATEGIC_ACTIVITY_CHALLENGE_PATTERN = /\b(?:meio|atividade|resultado|mudan[cç]a|efeito|impacto)\b/i;
const STRATEGIC_WEAK_TARGET_CUE_PATTERN = /\b(?:s[oó]|apenas)\s+(?:crescer\s+)?\d+(?:[.,]\d+)?\s*%|\bcrescer\s+(?:s[oó]|apenas)\s+\d+(?:[.,]\d+)?\s*%/i;
const STRATEGIC_TARGET_CHALLENGE_PATTERN = /\b(?:meta|alvo|ambicios[oa]|suficiente|fraca|pequena)\b|\d+(?:[.,]\d+)?\s*%[^.!?]{0,80}\b(?:resolve|provar|suficiente|relevante)\b/i;
const STRATEGIC_CAUSAL_DIAGNOSIS_PATTERN = /\b(?:caiu|queda|reduziu|piorou|diminuiu)\b[\s\S]{0,220}\b(?:porque|por causa|devido)\b/i;
const STRATEGIC_DIRECTION_JUMP_PATTERN = /\b(?:prop[oó]sito|miss[aã]o|vis[aã]o|valores?)\b/i;
const STRATEGIC_GROWTH_ASPIRATION_PATTERN = /\b(?:crescer|crescimento|expandir|expans[aã]o)\b/i;
const STRATEGIC_GROWTH_TENSION_PATTERN = /\breceita\b[\s\S]{0,260}\bmargem\b[\s\S]{0,260}\bcapacidade\b|\bmargem\b[\s\S]{0,260}\bcapacidade\b[\s\S]{0,260}\b(?:receita|crescimento)\b/i;
const STRATEGIC_GROWTH_TENSION_CHALLENGE_PATTERN = /\b(?:tens[aã]o|for[cç]ar|apertar|ren[uú]ncia|abrir m[aã]o|n[aã]o ser[aá] prioridade|deixar de priorizar|qual das outras)\b/i;
const STRATEGIC_GROWTH_CHOICE_PATTERN = /\breceita\b/i;
const STRATEGIC_MARGIN_CHOICE_PATTERN = /\bmargem\b/i;
const STRATEGIC_CAPACITY_CHOICE_PATTERN = /\bcapacidade\b/i;
const STRATEGIC_REPEATED_GOAL_PATTERN = /\b(?:repetir|repetida|repetido|novamente|de novo|manter)\b[\s\S]{0,180}\b(?:meta|alvo|objetiv[oa]|\d+(?:[.,]\d+)?\s*%)\b/i;
const STRATEGIC_REPEATED_GOAL_CHALLENGE_PATTERN = /\b(?:repet|recorr|volta|ciclo anterior|o que muda|diferente|travou|gargalo|avan[cç]ou)\b/i;
const STRATEGIC_COMPLETE_PLAN_REQUEST_PATTERN = /\bplano(?:\s+anual)?\s+completo\b[\s\S]{0,260}\b(?:sem\s+(?:repetir|recome[cç]ar)|valid(?:ar|e)\s+lacunas?|mont(?:ar|e)\s+(?:a\s+)?proposta)\b|\b(?:sem\s+(?:repetir|recome[cç]ar)|valid(?:ar|e)\s+lacunas?)\b[\s\S]{0,260}\bplano(?:\s+anual)?\s+completo\b/i;
const STRATEGIC_COMPLETE_PLAN_HANDOFF_PATTERN = /\b(?:envie|enviar|mande|mandar|cole|colar|compartilhe|bloco|arquivo)\b[\s\S]{0,180}\b(?:completo|conte[uú]do|dados|plano)\b|\b(?:lacuna|validar)\b[\s\S]{0,180}\b(?:bloco|conte[uú]do|plano)\b/i;
const STRATEGIC_GENERIC_DECISION_PATTERN = /\bo que destrava o avan[cç]o agora\b|\bfechar o resultado,?\s+o prazo,?\s+o respons[aá]vel\b/i;
const STRATEGIC_FACT_RESTART_PATTERN = /\bqual (?:e|é) (?:a |o )?(?:principal dor|prop[oó]sito|vis[aã]o|valores?)\b/i;
const STRATEGIC_UNGROUNDED_EXAMPLE_PATTERN = /\b(?:por exemplo|pode mirar|como exemplo)\b[\s\S]{0,220}\b\d+(?:[.,]\d+)?\s*%/i;
const STRATEGIC_DELEGATION_PENDING_PATTERN = /\b(?:delegac[aã]o|retaguarda)\b[\s\S]{0,140}\b(?:concentra[cç][aã]o|respons[aá]ve(?:l|is)|dono)\b|\bconcentra[cç][aã]o\b[\s\S]{0,140}\b(?:delegac[aã]o|retaguarda)\b/i;
const STRATEGIC_LIMITED_CAPACITY_PATTERN = /\bcapacidade\b[\s\S]{0,80}\b(?:limitad[ao]|restrit[ao]|gargalo)\b|\b(?:limitad[ao]|restrit[ao]|gargalo)\b[\s\S]{0,80}\bcapacidade\b/i;
const STRATEGIC_PORTFOLIO_LIMIT_PATTERN = /\b(?:quatro|4)\s+objetivos\b|\bobjetivo\s+4\b/i;
const STRATEGIC_RENUNCIATION_CONTEXT_PATTERN = /\bren[uú]ncias?\b/i;
const STRATEGIC_FINAL_TENSION_PATTERN = /\bcapacidade\b[\s\S]{0,260}\b(?:limite|ren[uú]ncia|prioridade|excesso|sobrecarga|pressionar)\b|\b(?:limite|ren[uú]ncia|prioridade|excesso|sobrecarga|pressionar)\b[\s\S]{0,260}\bcapacidade\b/i;
const QUARTERLY_VAGUE_IMPROVEMENT_PATTERN = /\b(?:precisamos|queremos|quero|vamos)?\s*melhorar\b[\s\S]{0,100}\b(?:neste|nesse|no)\s+trimestre\b/i;
const QUARTERLY_ACTIVITY_PATTERN = /\b((?:implantar|implementar|instalar|criar|contratar|configurar|adotar|lan[cç]ar)\s+(?:(?:um|uma|o|a)\s+)?[^,.!?\n]{2,80})/i;
const QUARTERLY_ACTIVITY_CHALLENGE_PATTERN = /\b(?:meio|atividade)\b|\b(?:qual|que)\s+(?:resultado|mudan[cç]a|efeito|impacto)\b|\b(?:precisa|deve|vai)\s+(?:produzir|gerar|mudar|melhorar)\b|\bado[cç][aã]o\b|\bresultados?\b[\s\S]{0,180}\b(?:qual desses|qual deles|visibilidade|redu[cç][aã]o|hist[oó]rico)\b/i;
const QUARTERLY_DIAGNOSIS_REPLY_PATTERN = /\b(?:problema|dor|gargalo|causa|impacto|afeta|prejudica|convers[aã]o|previsibilidade|demanda)\b/i;
const QUARTERLY_PROBLEM_IMPACT_PATTERN = /\b(?:dor|problema)\b[\s\S]{0,220}\bimpacto\b|\bimpacto\b[\s\S]{0,220}\b(?:dor|problema)\b/i;
const QUARTERLY_CAUSE_PATTERN = /\b(?:causa|porque|por causa|devido|origem|gargalo)\b/i;
const QUARTERLY_ALIGNMENT_JUMP_PATTERN = /\b(?:plano|objetivo|alinhamento)\s+(?:estrat[eé]gico|anual)\b[\s\S]{0,180}\b(?:exce[cç][aã]o|seguir|continuar)\b|\bexce[cç][aã]o\b[\s\S]{0,180}\b(?:plano|objetivo|alinhamento)\s+(?:estrat[eé]gico|anual)\b/i;
const QUARTERLY_REPEATED_GOAL_PATTERN = /\b(?:repetir|repetida|repetido|novamente|de novo|manter)\b[\s\S]{0,180}\b(?:meta|alvo|objetiv[oa]|\d+(?:[.,]\d+)?\s*%|por cento)\b/i;
const QUARTERLY_REPEATED_GOAL_MEMORY_PATTERN = /\b(?:repet|recorr|volt|ciclos? anteriores?|trajet[oó]ria|hist[oó]rico|avan[cç]o parcial)/i;
const QUARTERLY_REPEATED_GOAL_CHANGE_PATTERN = /\b(?:o que muda|o que precisa ser diferente|precisa mudar|causa|abordagem|evid[eê]ncia|aprendizado)\b/i;
const QUARTERLY_REPEATED_FACTS_PATTERN = /\b(?:ciclos?|trimestres?|per[ií]odos?)\s+anteriores?\b[\s\S]{0,320}\bcausa\b[\s\S]{0,320}\b(?:nova abordagem|abordagem diferente|mudan[cç]a de abordagem)\b/i;
const QUARTERLY_BASELINE_REINTERVIEW_PATTERN = /\b(?:qual|definir|confirma(?:r|e))\b[\s\S]{0,140}\b(?:indicador|baseline|linha de base|valor atual)\b/i;
const QUARTERLY_REPEATED_GOAL_MALFORMED_ECHO_PATTERN = /\bmanter\s+(?:reduzir|aumentar|elevar|diminuir)\b/i;
const QUARTERLY_PRODUCTIVITY_TARGET_PATTERN = /\b(?:aumentar|elevar|melhorar)\s+(?:a\s+)?produtividade\b[\s\S]{0,140}\b(?:\d+(?:[.,]\d+)?\s*%|(?:dez|vinte|trinta|quarenta|cinquenta)\s+por\s+cento)\b/i;
const QUARTERLY_PRODUCTIVITY_AMBIGUITY_PATTERN = /\b(?:n[aã]o\s+sabe\s+qual\s+medida|qual\s+medida\s+de\s+produtividade|duas?\s+(?:fontes|medidas|formas)\s+poss[ií]ve(?:l|is)|nenhum\s+baseline)\b/i;
const QUARTERLY_MEASURE_REPLY_PATTERN = /\b(?:medidas?|indicadores?|f[oó]rmulas?)\b/i;
const QUARTERLY_STRATEGIC_CHALLENGE_PATTERN = /\b(?:meta|alvo)\b[\s\S]{0,160}\b(?:suficiente|ambicios[oa]|realista|sustent[aá]vel|resolve)\b|\b(?:capacidade|sobrecarga|comporta|cabem|cabe)\b|\b(?:evid[eê]ncia intermedi[aá]ria|sinal antecipado|antes do fechamento|provar que)\b|\b(?:o que|qual)\b[\s\S]{0,100}\b(?:impedir|comprometer|risco|mudar o resultado)\b/i;
const QUARTERLY_PROCEED_AFTER_CHALLENGE_PATTERN = /\b(?:continue|continuar|prossiga|prosseguir|pode seguir|siga|seguir sem|considere tudo|apresente (?:agora )?(?:a )?(?:s[ií]ntese|proposta)|feche (?:a )?(?:s[ií]ntese|proposta))\b/i;
const QUARTERLY_DISCOUNT_QUALITY_PATTERN = /\breduzir\s+(?:o\s+)?desconto\s+m[eé]dio\b[\s\S]{0,140}\bqualidade\s+da\s+venda\b/i;
const QUARTERLY_KPI_HYPOTHESIS_CONTEXT_PATTERN = /\bDashboard\b[\s\S]{0,320}\bMargem operacional\b[\s\S]{0,320}\bhip[oó]tese\b[\s\S]{0,320}\b(?:escolher|vincular)\b/i;
const QUARTERLY_KPI_HYPOTHESIS_REPLY_PATTERN = /\bhip[oó]tese\b[\s\S]{0,280}\bMargem operacional\b|\bMargem operacional\b[\s\S]{0,280}\bhip[oó]tese\b/i;
const QUARTERLY_KPI_CHOICE_REPLY_PATTERN = /\b(?:quer|deseja|prefere|escolhe|confirma)\b[\s\S]{0,180}\bvincul|\bvincul[ao]\b[\s\S]{0,180}\b(?:quer|deseja|prefere|escolhe|confirma)\b/i;
const COMPLETION_REQUEST_PATTERN = /\b(?:considere tudo|dados (?:sao|são|estao|estão) suficientes|apresente (?:agora )?(?:a )?(?:sintese|síntese|proposta)|proposta final|pode gerar|pode montar|ja informei|já informei)\b/i;
const EXPLICIT_READY_PROPOSAL_PATTERN = /\b(?:dados concretos adicionais confirmados|para completar (?:o )?plano|plano (?:anual |trimestral |mensal )?completo)\b/i;
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
  mechanical_acknowledgement: "a resposta usa uma confirmacao mecanica seguida de parafrase",
  repeated_acknowledgement: "a resposta repete o mesmo bordao de abertura do turno anterior",
  ungrounded_question: "a pergunta pede um campo sem partir do fato que a motivou",
  verbose_regular_turn: "uma resposta comum ficou longa demais para uma conversa natural",
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
  quarterly_activity_unchallenged: "uma atividade trimestral recebeu campos genericos em vez de ser reenquadrada pelo resultado empresarial",
  quarterly_incomplete_actions: "faltou ao menos uma acao com dono, prazo e criterio de conclusao",
  quarterly_vague_diagnosis_missing: "uma abertura trimestral vaga recebeu campos genericos em vez de investigar o problema de negocio",
  quarterly_cause_bypassed: "a conducao pulou da dor e do impacto para o alinhamento anual sem investigar a causa",
  quarterly_repeated_goal_unchallenged: "uma meta trimestral recorrente nao usou o historico para perguntar o que muda no novo ciclo",
  quarterly_repeated_goal_reinterview: "trajetoria, causa e nova abordagem ja foram confirmadas, mas indicador ou baseline foram perguntados novamente",
  quarterly_repeated_goal_memory_omitted: "os ciclos anteriores foram confirmados, mas a resposta nao reconheceu a trajetoria antes de avancar",
  quarterly_repeated_goal_malformed_echo: "a meta recorrente foi repetida com uma frase truncada ou pouco natural",
  quarterly_productivity_measure_missing: "uma meta percentual de produtividade sem medida recebeu uma pergunta generica em vez de definir indicador ou escolher entre as fontes informadas",
  quarterly_discount_diagnosis_missing: "a abertura sobre desconto e qualidade da venda pulou o baseline para sugerir acoes prematuras",
  quarterly_kpi_hypothesis_choice_missing: "a hipotese desconto-margem nao foi explicada nem apresentada como escolha explicita de vinculo ao KPI existente",
  quarterly_confirmed_kpi_link_missing: "o gestor confirmou o vinculo de KPI como hipotese, mas a proposta nao preservou a chave real do indicador",
  quarterly_invalid_kpi_link: "o vinculo de KPI nao usou uma chave existente e permitida do Dashboard",
  quarterly_complete_block_unchallenged: "um bloco trimestral quase completo virou proposta antes de um desafio curto e contextual sobre meta, capacidade, risco, evidencia ou consistencia das acoes",
  quarterly_proceed_after_challenge_without_proposal: "o bloco trimestral ja foi desafiado e o gestor decidiu seguir; monte agora a proposta completa sem repetir a escolha nem abrir outra pergunta",
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
  strategic_activity_unchallenged: "uma atividade candidata a objetivo anual nao foi reenquadrada como meio para um resultado",
  strategic_weak_target_unchallenged: "uma meta apresentada como pequena nao foi confrontada com a dor que precisa resolver",
  strategic_diagnosis_jump: "a resposta abandonou uma causa concreta para voltar a direcionadores genericos",
  strategic_repeated_goal_unchallenged: "uma meta repetida nao foi tratada como recorrencia nem recebeu pergunta sobre o que muda agora",
  strategic_complete_plan_request_ignored: "o owner pediu validacao de um plano completo, mas a resposta reiniciou a entrevista",
  strategic_generic_decision_question: "a resposta anual caiu em uma pergunta generica que ignora os fatos ja fornecidos",
  strategic_fact_block_restart: "um bloco rico em fatos fez a resposta voltar para uma pergunta inicial ja superada",
  strategic_ungrounded_numeric_example: "a resposta sugeriu percentuais de exemplo que o gestor nao forneceu",
  strategic_unasked_pending_decision: "a proposta criou uma pendencia de delegacao sem esse desafio ter sido feito na conversa",
  strategic_growth_choice_incomplete: "uma aspiracao vaga de crescimento nao recebeu as escolhas de receita, margem e capacidade",
  strategic_growth_tension_unchallenged: "a tensao entre receita, margem e capacidade virou apenas outro menu, sem explicitar a renuncia",
  strategic_final_tension_missing: "a sintese anual ignorou que o portfolio ja pressiona uma capacidade explicitamente limitada",
};

const DETERMINISTIC_PROPOSAL_REPAIR_REASONS = new Set([
  "missing_adaptive_state",
  "incomplete_adaptive_state",
  "unverified_confirmed_facts",
  "fact_block_misclassified",
  "repeated_question",
  "mechanical_acknowledgement",
  "repeated_acknowledgement",
  "multiple_questions",
  "vague_without_options",
  "ungrounded_question",
  "technical_state_leak",
  "backward_phase",
  "ready_with_blocking_gap",
  "proposal_before_ready",
  "proposal_confirmation_count",
  "strategic_unasked_pending_decision",
  "strategic_final_tension_missing",
]);

export const ADAPTIVE_SESSION_RULES = `CONTRATO DE CONDUCAO ADAPTATIVA (obrigatorio):
- As fases sao um checklist de decisoes, nao um formulario por turnos. Absorva TODOS os fatos da mensagem atual e do historico; pule qualquer fase ja satisfeita e use next_phase para ir direto a primeira lacuna real, inclusive sintese.
- Cada state_patch deve incluir _adaptive no formato {"readiness":"vague|partial|ready","confirmed_facts":[""],"blocking_gap":string|null,"question_goal":string|null,"action_direction":string|null}. confirmed_facts lista somente CHAVES DE TOPO exatas do estado ja coletado ou do state_patch que tenham valor concreto; o servidor valida essas chaves. Esse bloco e interno e nunca aparece em reply.
- Use readiness=vague quando ainda faltam escolhas basicas; partial quando existe uma lacuna realmente bloqueante; ready somente quando a proposal completa pode ser criada agora.
- Se a resposta for vaga, reconheca o que foi dito e ofereca 2 ou 3 possibilidades curtas dentro de UMA pergunta neutra. Nao escolha pela pessoa.
- Se a resposta for parcial, faca somente a pergunta da lacuna bloqueante. Cite o fato que motivou a pergunta e a decisao ou acao que ela destrava.
- Se a resposta estiver pronta, monte a proposal na mesma resposta e peça UMA unica confirmacao. Nao pergunte se a pessoa quer resumo, proposta ou proxima etapa.
- Nunca repita semanticamente a ultima pergunta do Oraculo. Nunca exponha nomes de fase, _adaptive, base_confirmada, state_patch, next_phase ou a palavra tecnica proposal.
- Nao use "Entendi: voce quer..." nem outro bordao seguido de parafrase. Reconheca apenas quando isso acrescentar algo e varie a entrada; muitas vezes, va direto ao ponto.
- Fora de resumos finais, reply deve ter de 1 a 3 frases, em tom casual, tranquilo e objetivo. Listas servem apenas para opcoes de decisao. Toda pergunta precisa aproximar resultado, escolha, meta ou proxima acao executavel.`;

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

function looksLikeCompleteQuarterlyBlock(value: string) {
  if (!looksLikeFactBlock(value)) return false;
  const signals = [
    /\b(?:resultado principal|objetivo trimestral|objetivo principal)\b/i,
    /\b(?:baseline|valor atual|meta|alvo)\b|\bde\s+\d+(?:[.,]\d+)?\s*%?\s+para\s+\d+(?:[.,]\d+)?\s*%?/i,
    /\b(?:fonte|medido por|medida por)\b/i,
    /\b(?:prazo|per[ií]odo|at[eé]\s+\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/i,
    /\brespons[aá]vel\b/i,
    /\ba[cç][aã]o\s*\d*\b/i,
    /\bcrit[eé]rio\b/i,
    /\b(?:risco|mitiga[cç][aã]o|foco de aprendizado|cad[eê]ncia|acompanhamento)\b/i,
  ].filter((pattern) => pattern.test(value)).length;
  return signals >= 6;
}

function quarterlyCompleteBlockChallengeReply(userMessage: string) {
  const range = userMessage.match(/\bde\s+(\d+(?:[.,]\d+)?\s*%)\s+para\s+(\d+(?:[.,]\d+)?\s*%)/i);
  const measure = range ? ` de ${range[1]} para ${range[2]}` : "";
  return `A meta${measure} está clara. Qual evidência intermediária vai mostrar, antes do fechamento, que as ações realmente estão mudando esse resultado?`;
}

function oracleConversation(conversationText: string) {
  return conversationText
    .split(/\n(?=(?:oracle|user):\s*)/i)
    .filter((block) => /^oracle:\s*/i.test(block))
    .map((block) => block.replace(/^oracle:\s*/i, ""))
    .join("\n");
}

function hasQuarterlyStrategicChallenge(conversationText: string) {
  return QUARTERLY_STRATEGIC_CHALLENGE_PATTERN.test(oracleConversation(conversationText));
}

function firstVisibleLine(value: string) {
  return value.split("\n").map((line) => line.replace(/^[\s\-*>#]+/, "").trim()).find(Boolean) ?? "";
}

function openingAcknowledgement(value: string) {
  return normalizeForComparison(firstVisibleLine(value)).match(ACKNOWLEDGEMENT_PATTERN)?.[1] ?? "";
}

function regularTurnSentenceCount(value: string) {
  const prose = value.replace(/(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+/g, " ").trim();
  return (prose.match(/[.!?]+(?=\s|$)/g) ?? []).length || (prose ? 1 : 0);
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

export function deferUnchallengedQuarterlyProposal(input: {
  envelope: SessionEnvelope;
  sessionType: string;
  currentPhase: string;
  sessionState?: unknown;
  conversationText?: string;
  userMessage: string;
}) {
  if (input.sessionType !== "quarterly"
    || !input.envelope.proposal
    || !looksLikeCompleteQuarterlyBlock(input.userMessage)
    || hasQuarterlyStrategicChallenge(text(input.conversationText))) {
    return input.envelope;
  }

  const statePatch = asRecord(input.envelope.state_patch);
  return {
    ...input.envelope,
    reply: quarterlyCompleteBlockChallengeReply(input.userMessage),
    proposal: null,
    done: false,
    state_patch: {
      ...statePatch,
      _adaptive: {
        readiness: "partial",
        confirmed_facts: verifiedStateKeys(input.sessionState, statePatch),
        blocking_gap: "evidencia intermediaria ou decisao consciente de seguir",
        question_goal: "testar a consistencia da meta e das acoes",
        action_direction: "validar a abordagem antes da sintese",
      },
    },
    next_phase: input.currentPhase,
  };
}

export function acknowledgeEquivalentQuarterlyArea(input: {
  envelope: SessionEnvelope;
  sessionType: string;
  userMessage: string;
  planContext: string;
}) {
  const normalizedContext = normalizeForComparison(input.planContext);
  if (input.sessionType !== "quarterly"
    || !/\bindustrial\b/i.test(input.userMessage)
    || !normalizedContext.includes("area em foco producao")) {
    return input.envelope;
  }

  const reply = text(input.envelope.reply);
  const normalizedReply = normalizeForComparison(reply);
  const acknowledgements = [
    normalizedReply.includes("industrial") && normalizedReply.includes("producao")
      ? ""
      : "Industrial corresponde à área Produção cadastrada",
    normalizedContext.includes("memoria estrategica") && !/\b(?:hist[oó]rico|plano anterior|mem[oó]ria)\b/i.test(reply)
      ? "o histórico equivalente dessa área permanece como referência"
      : "",
  ].filter(Boolean);
  if (!acknowledgements.length) return input.envelope;

  return {
    ...input.envelope,
    reply: `${acknowledgements.join(", e ")}. ${reply}`.trim(),
  };
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
  if (MECHANICAL_ACKNOWLEDGEMENT_PATTERN.test(firstVisibleLine(reply))) reasons.push("mechanical_acknowledgement");
  const currentAcknowledgement = openingAcknowledgement(reply);
  const previousAcknowledgement = openingAcknowledgement(input.previousOracleReply);
  if (currentAcknowledgement && currentAcknowledgement === previousAcknowledgement) reasons.push("repeated_acknowledgement");
  if (questions.length > 1) reasons.push("multiple_questions");
  if (!hasProposal && !paused && questions.length === 0) reasons.push("missing_next_question");
  if (metadata?.readiness === "vague" && questions.length === 1 && !hasGuidedOptions(reply)) reasons.push("vague_without_options");
  if (metadata?.readiness === "partial" && questions.length === 1 && BARE_QUESTION_PATTERN.test(firstVisibleLine(reply))) {
    reasons.push("ungrounded_question");
  }
  if (!hasProposal && !paused && regularTurnSentenceCount(reply) > 4) reasons.push("verbose_regular_turn");
  if (TECHNICAL_STATE_PATTERN.test(reply)) reasons.push("technical_state_leak");
  if (input.sessionType === "strategic") {
    if (STRATEGIC_ACTIVITY_PATTERN.test(input.userMessage) && !STRATEGIC_ACTIVITY_CHALLENGE_PATTERN.test(reply)) {
      reasons.push("strategic_activity_unchallenged");
    }
    if (STRATEGIC_WEAK_TARGET_CUE_PATTERN.test(input.userMessage) && !STRATEGIC_TARGET_CHALLENGE_PATTERN.test(reply)) {
      reasons.push("strategic_weak_target_unchallenged");
    }
    if (STRATEGIC_CAUSAL_DIAGNOSIS_PATTERN.test(input.userMessage) && STRATEGIC_DIRECTION_JUMP_PATTERN.test(reply)) {
      reasons.push("strategic_diagnosis_jump");
    }
    if (STRATEGIC_REPEATED_GOAL_PATTERN.test(input.userMessage) && !STRATEGIC_REPEATED_GOAL_CHALLENGE_PATTERN.test(reply)) {
      reasons.push("strategic_repeated_goal_unchallenged");
    }
    if (!hasProposal
      && STRATEGIC_GROWTH_ASPIRATION_PATTERN.test(input.userMessage)
      && ![STRATEGIC_GROWTH_CHOICE_PATTERN, STRATEGIC_MARGIN_CHOICE_PATTERN, STRATEGIC_CAPACITY_CHOICE_PATTERN]
        .every((pattern) => pattern.test(reply))) {
      reasons.push("strategic_growth_choice_incomplete");
    }
    if (!hasProposal
      && STRATEGIC_GROWTH_TENSION_PATTERN.test(input.userMessage)
      && !STRATEGIC_GROWTH_TENSION_CHALLENGE_PATTERN.test(reply)) {
      reasons.push("strategic_growth_tension_unchallenged");
    }
    if (STRATEGIC_COMPLETE_PLAN_REQUEST_PATTERN.test(input.userMessage) && !hasProposal && !STRATEGIC_COMPLETE_PLAN_HANDOFF_PATTERN.test(reply)) {
      reasons.push("strategic_complete_plan_request_ignored");
    }
    if (!hasProposal && STRATEGIC_GENERIC_DECISION_PATTERN.test(reply)) {
      reasons.push("strategic_generic_decision_question");
    }
    if (looksLikeFactBlock(input.userMessage) && !hasProposal && STRATEGIC_FACT_RESTART_PATTERN.test(reply)) {
      reasons.push("strategic_fact_block_restart");
    }
    if (STRATEGIC_UNGROUNDED_EXAMPLE_PATTERN.test(reply) && !/\b\d+(?:[.,]\d+)?\s*%/i.test(input.userMessage)) {
      reasons.push("strategic_ungrounded_numeric_example");
    }
    if (hasProposal
      && STRATEGIC_LIMITED_CAPACITY_PATTERN.test(input.userMessage)
      && STRATEGIC_PORTFOLIO_LIMIT_PATTERN.test(input.userMessage)
      && STRATEGIC_RENUNCIATION_CONTEXT_PATTERN.test(input.userMessage)
      && !STRATEGIC_FINAL_TENSION_PATTERN.test(reply)) {
      reasons.push("strategic_final_tension_missing");
    }
    const pendingDecisions = asRecord(input.envelope.proposal).pendingDecisions;
    const hasDelegationPending = Array.isArray(pendingDecisions)
      && pendingDecisions.some((decision) => STRATEGIC_DELEGATION_PENDING_PATTERN.test(text(decision)));
    if (hasDelegationPending && !STRATEGIC_DELEGATION_PENDING_PATTERN.test(text(input.conversationText))) {
      reasons.push("strategic_unasked_pending_decision");
    }
  }
  if (input.sessionType === "quarterly") {
    const quarterlyActivity = input.userMessage.length <= 180 && QUARTERLY_ACTIVITY_PATTERN.test(input.userMessage);
    if (quarterlyActivity && (
      STRATEGIC_GENERIC_DECISION_PATTERN.test(reply)
      || !QUARTERLY_ACTIVITY_CHALLENGE_PATTERN.test(reply)
    )) {
      reasons.push("quarterly_activity_unchallenged");
    }
    if (QUARTERLY_VAGUE_IMPROVEMENT_PATTERN.test(input.userMessage)
      && !QUARTERLY_DIAGNOSIS_REPLY_PATTERN.test(reply)) {
      reasons.push("quarterly_vague_diagnosis_missing");
    }
    if (QUARTERLY_PROBLEM_IMPACT_PATTERN.test(input.userMessage)
      && !QUARTERLY_CAUSE_PATTERN.test(input.userMessage)
      && QUARTERLY_ALIGNMENT_JUMP_PATTERN.test(reply)) {
      reasons.push("quarterly_cause_bypassed");
    }
    if (QUARTERLY_REPEATED_GOAL_PATTERN.test(input.userMessage)
      && !(QUARTERLY_REPEATED_GOAL_MEMORY_PATTERN.test(reply)
        && QUARTERLY_REPEATED_GOAL_CHANGE_PATTERN.test(reply))) {
      reasons.push("quarterly_repeated_goal_unchallenged");
    }
    if (QUARTERLY_REPEATED_GOAL_PATTERN.test(input.userMessage)
      && QUARTERLY_REPEATED_GOAL_MALFORMED_ECHO_PATTERN.test(reply)) {
      reasons.push("quarterly_repeated_goal_malformed_echo");
    }
    if (QUARTERLY_REPEATED_FACTS_PATTERN.test(input.userMessage)
      && QUARTERLY_BASELINE_REINTERVIEW_PATTERN.test(reply)) {
      reasons.push("quarterly_repeated_goal_reinterview");
    }
    if (QUARTERLY_REPEATED_FACTS_PATTERN.test(input.userMessage)
      && !QUARTERLY_REPEATED_GOAL_MEMORY_PATTERN.test(reply)) {
      reasons.push("quarterly_repeated_goal_memory_omitted");
    }
    if ((QUARTERLY_PRODUCTIVITY_TARGET_PATTERN.test(input.userMessage)
      || QUARTERLY_PRODUCTIVITY_AMBIGUITY_PATTERN.test(input.userMessage))
      && !hasProposal
      && !quarterlyProductivityMeasureSatisfied(input.userMessage, reply)) {
      reasons.push("quarterly_productivity_measure_missing");
    }
    if (!hasProposal
      && input.userMessage.length <= 180
      && QUARTERLY_DISCOUNT_QUALITY_PATTERN.test(input.userMessage)
      && !/\bdesconto\s+m[eé]dio\s+atual\b|\bonde\s+(?:ele\s+)?[eé]\s+medido\b/i.test(reply)) {
      reasons.push("quarterly_discount_diagnosis_missing");
    }
    if (!hasProposal
      && QUARTERLY_KPI_HYPOTHESIS_CONTEXT_PATTERN.test(input.userMessage)
      && !(QUARTERLY_KPI_HYPOTHESIS_REPLY_PATTERN.test(reply) && QUARTERLY_KPI_CHOICE_REPLY_PATTERN.test(reply))) {
      reasons.push("quarterly_kpi_hypothesis_choice_missing");
    }
    if (hasProposal
      && /\bconfirma\s+v[ií]nculo\s+apenas\s+como\s+hip[oó]tese\b/i.test(input.userMessage)
      && !quarterlyKpiLinks(input.envelope.proposal).some((link) => text(asRecord(link).kpiKey) === "operating_margin")) {
      reasons.push("quarterly_confirmed_kpi_link_missing");
    }
    if (hasProposal
      && looksLikeCompleteQuarterlyBlock(input.userMessage)
      && !hasQuarterlyStrategicChallenge(text(input.conversationText))) {
      reasons.push("quarterly_complete_block_unchallenged");
    }
    if (!hasProposal
      && hasQuarterlyStrategicChallenge(text(input.conversationText))
      && QUARTERLY_PROCEED_AFTER_CHALLENGE_PATTERN.test(input.userMessage)) {
      reasons.push("quarterly_proceed_after_challenge_without_proposal");
    }
  }

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
  const quarterlyProceedInstruction = reasons.includes("quarterly_proceed_after_challenge_without_proposal")
    ? "\nO bloco trimestral completo e a checagem estrategica ja foram concluídos. A decisao de seguir sem evidencia adicional e consciente. Gere agora a proposal save_quarterly_plan completa e termine com uma unica confirmacao; nao faca outra pergunta de conteudo."
    : "";
  return `CORRECAO INTERNA OBRIGATORIA:
A resposta anterior foi recusada antes de chegar ao gestor:
${labels}

Trecho recusado: ${text(rejectedReply).replace(/\s+/g, " ").slice(0, 900) || "envelope invalido"}

Gere novamente o objeto JSON completo. Releia todas as mensagens, absorva os fatos ja fornecidos, avance para a primeira lacuna real ou monte a proposta se estiver pronta. Nao mencione esta correcao ao gestor.${quarterlyProceedInstruction}`;
}

export function safeAdaptiveNextPhase(currentPhase: string, requestedPhase: unknown, phases: string[], reasons: string[]) {
  const currentIndex = phases.indexOf(currentPhase);
  const requested = text(requestedPhase);
  const requestedIndex = phases.indexOf(requested);
  if (reasons.includes("phase_advance_without_evidence")) return currentPhase;
  if (currentIndex >= 0 && requestedIndex >= 0 && requestedIndex < currentIndex) return currentPhase;
  return requested || currentPhase;
}

export function normalizeReadyProposalEnvelope(input: {
  envelope: SessionEnvelope;
  reasons: string[];
  sessionType: string;
  currentPhase: string;
  phases: string[];
  userMessage: string;
  sessionState?: unknown;
}) {
  const metadata = adaptiveMetadata(input.envelope);
  const readinessConfirmed = metadata?.readiness === "ready"
    || COMPLETION_REQUEST_PATTERN.test(input.userMessage)
    || EXPLICIT_READY_PROPOSAL_PATTERN.test(input.userMessage);
  if (!readinessConfirmed || !input.envelope.proposal || !input.reasons.length
    || input.reasons.some((reason) => !DETERMINISTIC_PROPOSAL_REPAIR_REASONS.has(reason))) {
    return null;
  }
  const proposal = input.reasons.includes("strategic_unasked_pending_decision")
    ? {
      ...asRecord(input.envelope.proposal),
      pendingDecisions: Array.isArray(asRecord(input.envelope.proposal).pendingDecisions)
        ? (asRecord(input.envelope.proposal).pendingDecisions as unknown[])
          .filter((decision) => !STRATEGIC_DELEGATION_PENDING_PATTERN.test(text(decision)))
        : [],
    }
    : input.envelope.proposal;
  return {
    ...input.envelope,
    proposal,
    reply: input.reasons.includes("strategic_final_tension_missing")
      ? strategicTensionConfirmationReply(proposal)
      : proposalConfirmationReply(proposal, input.sessionType),
    state_patch: ensureAdaptiveStatePatch(
      input.envelope.state_patch,
      input.userMessage,
      true,
      true,
      input.sessionState,
    ),
    next_phase: safeAdaptiveNextPhase(
      input.currentPhase,
      input.envelope.next_phase,
      input.phases,
      input.reasons,
    ),
  };
}

export function recoverAdaptiveEnvelopeAfterRepairFailure(input: {
  envelope?: SessionEnvelope | null;
  reasons: string[];
  sessionType: string;
  currentPhase: string;
  phases: string[];
  userMessage: string;
  sessionState?: unknown;
}) {
  const envelope = input.envelope ?? {};
  const proposalIsPremature = input.reasons.includes("proposal_before_ready")
    || input.reasons.includes("ready_with_blocking_gap")
    || input.reasons.some((reason) => reason.startsWith("quarterly_") || reason.startsWith("monthly_"));
  const proposal = proposalIsPremature ? null : envelope.proposal;
  const hasProposal = Boolean(proposal);
  const paused = isPause(envelope.state_patch);
  return {
    ...envelope,
    proposal,
    done: hasProposal ? envelope.done : false,
    reply: adaptiveFallbackReply(hasProposal, paused, input.reasons, {
      rejectedReply: envelope.reply,
      userMessage: input.userMessage,
      proposal,
      sessionType: input.sessionType,
    }),
    state_patch: ensureAdaptiveStatePatch(
      envelope.state_patch,
      input.userMessage,
      hasProposal,
      true,
      input.sessionState,
    ),
    next_phase: safeAdaptiveNextPhase(
      input.currentPhase,
      envelope.next_phase,
      input.phases,
      input.reasons,
    ),
  };
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

function naturalizeRejectedReply(value: string, userMessage: string, hasProposal: boolean, reasons: string[]) {
  const unsafeVisibleReasons = new Set([
    "fact_block_misclassified",
    "repeated_question",
    "multiple_questions",
    "missing_next_question",
    "vague_without_options",
    "technical_state_leak",
    "ready_without_proposal",
    "proposal_before_ready",
    "ignored_completion_request",
    "proposal_confirmation_count",
    "strategic_activity_unchallenged",
    "strategic_weak_target_unchallenged",
    "strategic_diagnosis_jump",
    "strategic_growth_tension_unchallenged",
  ]);
  if (!value || !reasons.length || reasons.some((reason) => unsafeVisibleReasons.has(reason)
    || reason.startsWith("quarterly_")
    || reason.startsWith("monthly_"))) return "";
  if (TECHNICAL_STATE_PATTERN.test(value) || visibleQuestions(value).length !== 1) return "";

  let reply = value
    .replace(/^(?:entendi|perfeito|[oó]timo|boa|certo|fechado)[.!,:-]?\s+(?:voc[eê]\s+(?:quer|disse|trouxe)|que\s+)[^.!?]+[.!?]\s*/i, "")
    .replace(/^(?:entendi|perfeito|[oó]timo|boa|certo|fechado)[.!,:-]?\s*/i, "")
    .trim();
  if (!hasProposal && regularTurnSentenceCount(reply) > 4) {
    const sentences = reply.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((item) => item.trim()).filter(Boolean) ?? [];
    const question = [...sentences].reverse().find((item) => item.endsWith("?"));
    reply = [sentences.find((item) => !item.endsWith("?")), question].filter(Boolean).join(" ");
  }
  if (!hasProposal && reasons.includes("ungrounded_question") && BARE_QUESTION_PATTERN.test(firstVisibleLine(reply))) {
    const fact = userMessage.split(/[.!?\n]/).map((item) => item.trim()).find((item) => item.length >= 12)?.slice(0, 140);
    if (fact) reply = `${fact}. ${reply}`;
  }
  return reply && !TECHNICAL_STATE_PATTERN.test(reply) && visibleQuestions(reply).length === 1 ? reply : "";
}

function proposalConfirmationReply(proposal: unknown, sessionType: string) {
  const value = asRecord(proposal);
  const type = text(value.type);
  if (type === "apply_strategic_review") {
    const adjustments = Array.isArray(value.adjustments) ? value.adjustments.map(asRecord) : [];
    const first = adjustments[0] ?? {};
    if (adjustments.length === 1 && text(first.title) && text(first.from) && text(first.to)) {
      const reason = text(first.because);
      return `A revisão altera apenas “${text(first.title)}”, de ${text(first.from)} para ${text(first.to)}${reason ? `, porque ${reason}` : ""}. Posso aplicar?`;
    }
    if (adjustments.length > 0) return `A revisão reúne ${adjustments.length} ajustes no plano atual. Posso aplicar?`;
  }
  if (type === "save_monthly_plan") {
    const normalized = asRecord(normalizeMonthlyContinuity(value));
    const objectives = Array.isArray(normalized.objectives) ? normalized.objectives.map(asRecord) : [];
    const first = objectives[0] ?? {};
    const result = text(first.result) || text(first.title);
    if (result) {
      const suffix = objectives.length > 1 ? ` e mais ${objectives.length - 1} resultado${objectives.length > 2 ? "s" : ""}` : "";
      const pending = Array.isArray(normalized.pendingDecisions) ? normalized.pendingDecisions.map(asRecord)[0] ?? {} : {};
      const action = Array.isArray(first.actions) ? first.actions.map(asRecord)[0] ?? {} : {};
      const decisionLabels: Record<string, string> = {
        roll: "rolar",
        renegotiate: "renegociar",
        cut: "cortar",
        backlog: "enviar ao backlog",
      };
      const decision = decisionLabels[text(pending.decision ?? pending.decisao).toLowerCase()] ?? text(pending.decision ?? pending.decisao);
      const pendingSummary = text(pending.item ?? pending.pendencia)
        ? `Pendência herdada: ${text(pending.item ?? pending.pendencia)}, de ${text(pending.origin ?? pending.origem)}, decisão de ${decision} por ${text(pending.reason ?? pending.motivo)}.`
        : "";
      const deadline = text(action.deadline ?? action.prazo);
      const criterion = text(action.completionCriterion ?? action.completion_criterion ?? action.criterio);
      const allActions = objectives.flatMap((objective) => Array.isArray(objective.actions)
        ? objective.actions.map(asRecord)
        : []);
      const actionSummary = allActions
        .map((item, index) => {
          const description = text(item.description ?? item.descricao);
          if (!description) return "";
          const details = [
            text(item.deadline ?? item.prazo) ? `prazo ${text(item.deadline ?? item.prazo)}` : "",
            text(item.completionCriterion ?? item.completion_criterion ?? item.criterio)
              ? `critério ${text(item.completionCriterion ?? item.completion_criterion ?? item.criterio)}` : "",
            text(item.owner ?? item.responsavel) ? `responsável ${text(item.owner ?? item.responsavel)}` : "",
          ].filter(Boolean);
          return `${index + 1}. ${description}${details.length ? ` (${details.join("; ")})` : ""}`;
        })
        .filter(Boolean);
      const backlog = Array.isArray(normalized.backlog) ? normalized.backlog.map(text).filter(Boolean) : [];
      const blockers = Array.isArray(normalized.blockers) ? normalized.blockers.map(text).filter(Boolean) : [];
      const capacity = asRecord(normalized.capacity);
      const maxActions = Number(capacity.maxCommittedActions ?? 5);
      return [
        "**Plano do mês**",
        `Resultado: ${result}${suffix}.`,
        text(first.source) ? `Fonte: ${text(first.source)}.` : "",
        text(first.owner) || text(first.deadline)
          ? `Responsável e prazo: ${[text(first.owner), text(first.deadline)].filter(Boolean).join(" · ")}.`
          : "",
        actionSummary.length ? `Ações comprometidas (${allActions.length}/${maxActions}): ${actionSummary.join("; ")}.` : "",
        backlog.length ? `Backlog: ${backlog.join("; ")}.` : "",
        pendingSummary,
        deadline || criterion ? `Novo prazo e aceite: ${deadline}${criterion ? `; ${criterion}` : ""}.` : "",
        blockers.length ? `Bloqueio: ${blockers.join("; ")}.` : "",
        text(normalized.cadence) ? `Acompanhamento: ${text(normalized.cadence)}` : "",
        text(normalized.confidence) ? `Confiança: ${text(normalized.confidence)}.` : "",
        text(normalized.nextCommitment) ? `Próximo compromisso: ${text(normalized.nextCommitment).replace(/[.]+$/, "")}.` : "",
        "Posso gravar?",
      ].filter(Boolean).join("\n");
    }
  }
  if (sessionType === "quarterly") {
    const objectives = Array.isArray(value.quarterlyObjectives)
      ? value.quarterlyObjectives.map(asRecord)
      : [];
    const learningFocus = Array.isArray(value.learningFocus)
      ? value.learningFocus.map(text).filter(Boolean)
      : [];
    const cadence = text(value.cadence);
    const objectiveLines = objectives.map((objective, index) => {
      const result = text(objective.result) || text(objective.title) || `Resultado ${index + 1}`;
      const current = text(objective.current) || text(objective.baseline);
      const target = text(objective.target);
      const source = text(objective.source);
      const deadline = text(objective.deadline);
      const owner = text(objective.owner);
      const normalizedResult = normalizeForComparison(result);
      const resultAlreadyMeasured = current && target
        && normalizedResult.includes(normalizeForComparison(current))
        && normalizedResult.includes(normalizeForComparison(target));
      const measure = resultAlreadyMeasured ? "" : current && target ? ` de ${current} para ${target}` : target ? ` com alvo ${target}` : "";
      const proof = source ? `, medido por ${source}` : "";
      const due = deadline ? `, até ${deadline}` : "";
      const responsible = owner ? `, com ${owner} responsável` : "";
      return `${objectives.length > 1 ? `${index + 1}. ` : ""}${result}${measure}${proof}${due}${responsible}.`;
    });
    const actionEntries = uniqueQuarterlyActionEntries(value);
    const actionCount = actionEntries.length;
    const actionDescriptions = actionEntries
      .map(({ action }) => text(action.description ?? action.descricao))
      .filter(Boolean);
    const kpiEntries = quarterlyKpiLinks(value);
    const kpiSummary = kpiEntries.map((link) => {
      const record = asRecord(link);
      const label = quarterlyKpiLabel(record.kpiKey ?? record.kpi_key);
      const rationale = text(record.rationale ?? record.justificativa);
      return rationale ? `${label} (${rationale})` : label;
    }).filter(Boolean);
    return [
      "**Plano do trimestre**",
      ...objectiveLines,
      actionDescriptions.length ? `Ações que mudam a abordagem: ${actionDescriptions.join("; ")}.` : "",
      kpiSummary.length ? `Hipótese de impacto confirmada: ${kpiSummary.join("; ")}.` : "",
      learningFocus.length ? `Foco de aprendizado: ${learningFocus.join("; ")}.` : "",
      cadence ? `Ritmo de acompanhamento: ${cadence}.` : "",
      actionCount ? `Execução: ${actionCount} ${actionCount === 1 ? "ação" : "ações"} com prazo e critério de conclusão.` : "",
      "Posso gravar?",
    ].filter(Boolean).join("\n");
  }
  if (sessionType === "strategic") return "O plano anual ficou pronto com as escolhas que você fez. Posso gravar?";
  return "A proposta ficou pronta com o que você definiu. Posso gravar?";
}

function strategicTensionConfirmationReply(proposal: unknown) {
  const value = asRecord(proposal);
  const objectives = Array.isArray(value.objectives) ? value.objectives.map(asRecord) : [];
  const projects = Array.isArray(value.projects) ? value.projects.map(asRecord) : [];
  const themes = Array.isArray(value.themes) ? value.themes.map(text).filter(Boolean) : [];
  const renunciations = Array.isArray(value.renunciations) ? value.renunciations.map(text).filter(Boolean) : [];
  const risks = Array.isArray(value.risks) ? value.risks.map(text).filter(Boolean) : [];
  const rituals = Array.isArray(value.rituals) ? value.rituals.map(text).filter(Boolean) : [];
  const objectiveSummary = objectives.map((objective) => {
    const label = text(objective.metric) || text(objective.title) || "resultado";
    const current = text(objective.current);
    const target = text(objective.target) || text(objective.result);
    return [label, current && target ? `${current} para ${target}` : target].filter(Boolean).join(": ");
  }).filter(Boolean);
  const projectSummary = projects.map((project) => text(project.name)).filter(Boolean);
  const year = text(value.year);
  return [
    `**Plano anual${year ? ` ${year}` : ""}**`,
    themes.length ? `Tema: ${themes.join("; ")}.` : "",
    objectiveSummary.length ? `Metas: ${objectiveSummary.join("; ")}.` : "",
    projectSummary.length ? `Projetos: ${projectSummary.join("; ")}.` : "",
    renunciations.length ? `Renúncias: ${renunciations.join("; ")}.` : "",
    risks.length ? `Riscos: ${risks.join("; ")}.` : "",
    rituals.length ? `Ritmo: ${rituals.join("; ")}.` : "",
    `Ponto de tensão: ${objectives.length || "os"} objetivos e ${projects.length || "os"} projetos já ocupam o limite de uma empresa com capacidade restrita; as renúncias precisam ser reais para o crescimento não voltar a pressionar margem e entrega.`,
    "Confirma para gravar?",
  ].filter(Boolean).join("\n");
}

function quarterlyProductivityOptions(userMessage: string) {
  const match = userMessage.match(/\b(?:duas?|2)\s+(?:fontes|medidas|formas)\s+poss[ií]ve(?:l|is)[^:\n]{0,80}:\s*([^\n.]+)/i);
  if (!match?.[1]) return [];
  return match[1]
    .split(/\s+(?:e|ou)\s+|\s*,\s*/i)
    .map((option) => option.trim().replace(/[;:,.!?]+$/, ""))
    .filter((option) => option.length >= 4)
    .slice(0, 3);
}

function quarterlyProductivityMeasureReply(userMessage: string) {
  const options = quarterlyProductivityOptions(userMessage);
  if (options.length >= 2) {
    return `Temos duas formas possíveis de medir produtividade: ${options[0]} e ${options[1]}. Qual delas representa melhor o resultado que você quer elevar neste trimestre?`;
  }
  return "Aumentar a produtividade em percentual só fica verificável depois de definir a medida. Qual indicador representa melhor a produtividade que você quer elevar neste trimestre?";
}

function quarterlyProductivityMeasureSatisfied(userMessage: string, reply: string) {
  if (!QUARTERLY_MEASURE_REPLY_PATTERN.test(reply)) return false;
  const options = quarterlyProductivityOptions(userMessage);
  if (options.length < 2) return true;
  const normalizedReply = normalizeForComparison(reply);
  return options.every((option) => normalizedReply.includes(normalizeForComparison(option)));
}

function strategicDecisionFallback(userMessage: string, sessionType: string) {
  if (sessionType === "strategic") {
    if (STRATEGIC_COMPLETE_PLAN_REQUEST_PATTERN.test(userMessage)) {
      return "Pode mandar o bloco completo em uma mensagem? Eu valido só as lacunas reais e devolvo a proposta sem refazer a entrevista.";
    }
    if (STRATEGIC_REPEATED_GOAL_PATTERN.test(userMessage)) {
      const target = userMessage.match(/\b\d+(?:[.,]\d+)?\s*%/i)?.[0];
      return `Essa meta${target ? ` de ${target}` : ""} está voltando, então vale preservar o aprendizado em vez de apenas copiá-la. O que travou no ciclo anterior e precisa ser diferente agora?`;
    }
    if (STRATEGIC_CAUSAL_DIAGNOSIS_PATTERN.test(userMessage)) {
      return "A queda que você descreveu já tem causas concretas. Qual delas precisa ser atacada primeiro para recuperar o resultado?";
    }
    if (looksLikeFactBlock(userMessage)) {
      if (/\bciclo anterior\b/i.test(userMessage) && /\b(?:gargalo|fornecedor)\b/i.test(userMessage) && /\bnova abordagem\b/i.test(userMessage)) {
        return "O resultado avançou em parte, e você já trouxe a causa e uma abordagem diferente para os gargalos. Qual evidência vai provar que essa mudança funcionou neste ciclo?";
      }
      if (/\bmargem\b/i.test(userMessage) && /\bcapacidade\b/i.test(userMessage)
        && /\b(?:duas restri[cç][oõ]es|podem ser adiados|podem esperar|adiar)\b/i.test(userMessage)) {
        return "Margem e prazo são as duas restrições, e algumas frentes já podem esperar. Qual delas deve receber capacidade primeiro para orientar as renúncias do ano?";
      }
      if (/\bfechamento\b/i.test(userMessage) && /\bdados padronizados\b/i.test(userMessage)) {
        return "Você já trouxe dois efeitos mensuráveis: reduzir o fechamento e ampliar o uso de dados padronizados. Qual deles deve liderar o objetivo anual?";
      }
      if (/\bquatro objetivos\b/i.test(userMessage) && /\bbaseline\b/i.test(userMessage) && /\bquatro projetos\b/i.test(userMessage)) {
        return "A estrutura está completa, mas os valores e vínculos ainda não vieram neste bloco. Pode enviar o conteúdo concreto inteiro para eu validar sem reentrevistar?";
      }
    }
    const activity = userMessage.match(/["'“”]([^"'“”]{4,100})["'“”]/)?.[1]
      ?? userMessage.match(/\b((?:fazer|criar|lan[cç]ar|executar|realizar)\s+(?:um|uma)?\s*[^,.!?]{3,80})/i)?.[1];
    const target = userMessage.match(/\b\d+(?:[.,]\d+)?\s*%/i)?.[0];
    const optionNames = ["margem", "receita", "volume", "previsibilidade", "conversão", "conversao"]
      .filter((option, index, values) => values.indexOf(option) === index && new RegExp(`\\b${option}\\b`, "i").test(userMessage));
    if (activity) {
      const targetChallenge = target ? `, e ${target} ainda precisa provar que resolve a dor` : "";
      const options = optionNames.length >= 2
        ? optionNames.map((option) => option === "conversao" ? "conversão" : option).join(", ").replace(/, ([^,]+)$/, " ou $1")
        : "resultado empresarial";
      return `“${activity.trim()}” descreve o meio, não a mudança que a empresa precisa alcançar${targetChallenge}. Qual foco precisa mudar de verdade: ${options}?`;
    }
    if (target) {
      return `A meta de ${target} precisa nascer do problema que queremos resolver. Qual mudança empresarial tornaria esse número relevante?`;
    }
    if (STRATEGIC_GROWTH_TENSION_PATTERN.test(userMessage)) {
      return "Receita estável, margem variável e capacidade limitada formam a tensão central: forçar crescimento sem capacidade pode apertar ainda mais a margem. Qual escolha deve liderar o ano, e qual das outras duas não será prioridade agora?";
    }
    if (STRATEGIC_GROWTH_ASPIRATION_PATTERN.test(userMessage)) {
      return "Crescer ainda deixa três caminhos bem diferentes. Qual precisa liderar o ano: ampliar receita na carteira, proteger margem ou destravar capacidade de entrega?";
    }
  }
  if (sessionType === "quarterly" && QUARTERLY_REPEATED_FACTS_PATTERN.test(userMessage)) {
    const trajectory = userMessage
      .split(/\n+/)
      .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
      .find((line) => /\b(?:ciclos?|trimestres?|per[ií]odos?)\s+anteriores?\b/i.test(line));
    return [
      trajectory ? trajectory.replace(/[.!?]+$/, "") + "." : "A trajetória dos ciclos anteriores já está clara.",
      "A causa e a nova abordagem também estão confirmadas.",
      "Qual evidência intermediária vai mostrar que a mudança está funcionando antes do fechamento?",
    ].join(" ");
  }
  if (sessionType === "quarterly" && QUARTERLY_REPEATED_GOAL_PATTERN.test(userMessage)) {
    return "Essa meta está voltando, então não vale simplesmente copiá-la. O que mudou desde o ciclo anterior na causa, na abordagem ou na evidência de acompanhamento?";
  }
  if (sessionType === "quarterly" && (
    QUARTERLY_PRODUCTIVITY_TARGET_PATTERN.test(userMessage)
    || QUARTERLY_PRODUCTIVITY_AMBIGUITY_PATTERN.test(userMessage)
  )) {
    return quarterlyProductivityMeasureReply(userMessage);
  }
  if (sessionType === "quarterly" && QUARTERLY_KPI_HYPOTHESIS_CONTEXT_PATTERN.test(userMessage)) {
    return "Reduzir desconto pode elevar a Margem operacional, mas esse efeito ainda é uma hipótese, não uma causalidade comprovada. Você quer vincular este objetivo ao KPI existente Margem operacional para acompanhar a hipótese?";
  }
  if (sessionType === "quarterly" && userMessage.length <= 180 && QUARTERLY_DISCOUNT_QUALITY_PATTERN.test(userMessage)) {
    return "Para transformar desconto e qualidade da venda em um resultado verificável, qual é o desconto médio atual e onde ele é medido?";
  }
  if (sessionType === "quarterly" && looksLikeCompleteQuarterlyBlock(userMessage)) {
    return quarterlyCompleteBlockChallengeReply(userMessage);
  }
  const quarterlyActivity = sessionType === "quarterly" && userMessage.length <= 180
    ? userMessage.match(QUARTERLY_ACTIVITY_PATTERN)?.[1]?.trim() ?? ""
    : "";
  if (quarterlyActivity) {
    const options = /\bCRM\b/i.test(quarterlyActivity)
      ? "previsibilidade do funil, velocidade do acompanhamento, adoção pela equipe ou outro resultado concreto"
      : "resultado empresarial, adoção, eficiência ou outra mudança mensurável";
    return `“${quarterlyActivity}” descreve o meio. O que precisa mudar de verdade neste trimestre: ${options}?`;
  }
  if (sessionType === "quarterly" && /\bprioridades?\b/i.test(userMessage) && /\b(?:capacidade|comporta|cabem|cabe)\b/i.test(userMessage)) {
    return "Há mais prioridades do que capacidade, então manter todas esconderia a escolha. Quais entregas têm maior impacto no objetivo anual dentro da capacidade real?";
  }
  if (sessionType === "quarterly" && QUARTERLY_VAGUE_IMPROVEMENT_PATTERN.test(userMessage)) {
    return "“Melhorar” ainda está amplo. O que mais prejudica o resultado hoje: geração de demanda, conversão, previsibilidade ou outro problema concreto?";
  }
  if (sessionType === "quarterly" && QUARTERLY_PROBLEM_IMPACT_PATTERN.test(userMessage) && !QUARTERLY_CAUSE_PATTERN.test(userMessage)) {
    return "O impacto no resultado já está claro. O que mais causa esse problema hoje: processo, dados, rotina da equipe ou outro gargalo?";
  }
  return "";
}

export function normalizeProposalConfirmationEnvelope(envelope: SessionEnvelope, sessionType: string) {
  if (sessionType === "monthly" && text(asRecord(envelope.proposal).type) === "save_monthly_plan") {
    const proposal = normalizeMonthlyContinuity(envelope.proposal);
    return { ...envelope, proposal, reply: proposalConfirmationReply(proposal, sessionType) };
  }
  if (sessionType !== "quarterly" || text(asRecord(envelope.proposal).type) !== "save_quarterly_plan") return envelope;
  const proposal = normalizeQuarterlyKpiLinks(normalizeQuarterlySharedActions(envelope.proposal));
  return {
    ...envelope,
    proposal,
    reply: proposalConfirmationReply(proposal, sessionType),
  };
}

export function adaptiveFallbackReply(
  hasProposal: boolean,
  paused: boolean,
  reasons: string[] = [],
  context: { rejectedReply?: string; userMessage?: string; proposal?: unknown; sessionType?: string } = {},
) {
  if (paused) return "Tudo bem. A sessão fica salva e a gente retoma daqui quando você quiser.";
  if (hasProposal && text(context.sessionType) === "strategic" && reasons.includes("strategic_final_tension_missing")) {
    return strategicTensionConfirmationReply(context.proposal);
  }
  const naturalized = naturalizeRejectedReply(
    text(context.rejectedReply),
    text(context.userMessage),
    hasProposal,
    reasons,
  );
  if (naturalized) return naturalized;
  if (hasProposal) return proposalConfirmationReply(context.proposal, text(context.sessionType));
  if (reasons.includes("monthly_pending_without_options")) {
    return "Essa pendência precisa de um destino claro para não entrar silenciosamente em maio. Você prefere rolar com um novo prazo, renegociar, cortar ou deixar no backlog?";
  }
  const strategicFallback = strategicDecisionFallback(text(context.userMessage), text(context.sessionType));
  if (strategicFallback) return strategicFallback;
  return "Já temos uma parte importante definida e falta transformar isso na próxima decisão. O que destrava o avanço agora: fechar o resultado, o prazo, o responsável ou a primeira ação?";
}
