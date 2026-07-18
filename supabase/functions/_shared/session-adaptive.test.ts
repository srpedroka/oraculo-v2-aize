import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_SESSION_RULES,
  acknowledgeEquivalentQuarterlyArea,
  adaptiveFallbackReply,
  buildAdaptiveRepairDirective,
  challengeQuarterlyPriorityOverload,
  deferUnchallengedQuarterlyProposal,
  ensureAdaptiveStatePatch,
  latestOracleReply,
  normalizeProposalConfirmationEnvelope,
  normalizeStrategicHistoricalLessons,
  normalizeReadyProposalEnvelope,
  recoverAdaptiveEnvelopeAfterRepairFailure,
  repeatsPreviousQuestion,
  safeAdaptiveNextPhase,
  validateAdaptiveEnvelope,
  visibleQuestions,
} from "./session-adaptive.ts";

const phases = ["abertura", "diagnostico", "sintese"];

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    reply: "Você quer priorizar receita, margem ou retenção?",
    state_patch: {
      _adaptive: {
        readiness: "vague",
        confirmed_facts: [],
        blocking_gap: "prioridade",
        question_goal: "definir prioridade",
        action_direction: "escolher o foco",
      },
    },
    next_phase: "abertura",
    ...overrides,
  };
}

function reasons(overrides: Record<string, unknown> = {}, input: Partial<Parameters<typeof validateAdaptiveEnvelope>[0]> = {}) {
  return validateAdaptiveEnvelope({
    envelope: envelope(overrides),
    currentPhase: "abertura",
    phases,
    previousOracleReply: "",
    userMessage: "Quero melhorar o negócio.",
    ...input,
  });
}

describe("adaptive planning session guard Q4A", () => {
  it("reproduces and blocks the semantic question loop seen in the pilot", () => {
    const previous = "Vamos montar o plano do trimestre da área. Antes de começarmos: qual é o principal desafio da sua área hoje?";
    const reply = "Você trouxe um bom contexto. Antes de avançarmos: qual é o principal desafio da sua área hoje?";

    expect(repeatsPreviousQuestion(reply, previous)).toBe(true);
    expect(reasons({ reply }, { previousOracleReply: previous })).toContain("repeated_question");
  });

  it("allows an action-oriented next question that advances the conversation", () => {
    const previous = "Qual é o principal desafio da sua área hoje?";
    const reply = "Entendi o gargalo de conversão. Você quer atacar primeiro volume de propostas, taxa de fechamento ou tempo de resposta?";

    expect(repeatsPreviousQuestion(reply, previous)).toBe(false);
    expect(reasons({ reply }, { previousOracleReply: previous })).toEqual([]);
  });

  it("blocks a mechanical acknowledgement followed by paraphrase", () => {
    expect(reasons({
      reply: "Entendi: você quer recuperar margem. Para definir a meta, qual patamar precisa ser alcançado?",
      state_patch: {
        _adaptive: {
          readiness: "partial",
          confirmed_facts: [],
          blocking_gap: "meta",
          question_goal: "definir meta",
          action_direction: "fechar o resultado",
        },
      },
    })).toContain("mechanical_acknowledgement");
  });

  it("blocks the same canned acknowledgement in consecutive turns", () => {
    expect(reasons({
      reply: "Certo. Para escolher a frente, você quer atacar preço, mix ou desconto?",
    }, {
      previousOracleReply: "Certo. O foco anterior ficou claro. Você quer começar por receita ou margem?",
    })).toContain("repeated_acknowledgement");
  });

  it("blocks a bare field question and allows a grounded decision question", () => {
    const partialState = {
      _adaptive: {
        readiness: "partial",
        confirmed_facts: [],
        blocking_gap: "meta",
        question_goal: "definir meta",
        action_direction: "fechar o resultado",
      },
    };
    expect(reasons({ reply: "Qual é a meta?", state_patch: partialState })).toContain("ungrounded_question");
    expect(reasons({
      reply: "A margem caiu mesmo com o volume estável. Para escolher a primeira alavanca, o maior vazamento está em preço, mix ou desconto?",
      state_patch: partialState,
    })).not.toContain("ungrounded_question");
  });

  it("keeps ordinary turns brief", () => {
    expect(reasons({
      reply: "A margem caiu. O volume ficou estável. O desconto aumentou. O mix piorou. Para escolher a primeira alavanca, o maior vazamento está em preço, mix ou desconto?",
      state_patch: {
        _adaptive: {
          readiness: "partial",
          confirmed_facts: [],
          blocking_gap: "causa",
          question_goal: "identificar causa",
          action_direction: "escolher a primeira alavanca",
        },
      },
    })).toContain("verbose_regular_turn");
  });

  it("blocks multiple visible questions in one turn", () => {
    expect(reasons({ reply: "Qual é o resultado esperado? E qual é o prazo?" })).toContain("multiple_questions");
  });

  it("blocks internal state names from the visible reply", () => {
    expect(reasons({ reply: "Atualizei a base_confirmada. Você quer receita, margem ou retenção?" })).toContain("technical_state_leak");
  });

  it("does not let a fact-rich block be treated as vague", () => {
    const factBlock = [
      "Objetivo: implantar o CRM em toda a área comercial.",
      "Meta: 80% dos vendedores ativos até setembro.",
      "Responsável: Diego.",
      "Prazo: 30 de setembro.",
      "Ação: migrar a base e integrar ao ERP.",
    ].join("\n");

    expect(reasons({}, { userMessage: factBlock })).toContain("fact_block_misclassified");
  });

  it("accepts a ready proposal with one final confirmation", () => {
    const result = reasons({
      reply: "Organizei o plano com o objetivo, a meta e a primeira ação. Confirma a gravação?",
      state_patch: {
        prioridade: "receita",
        _adaptive: {
          readiness: "ready",
          confirmed_facts: ["prioridade"],
          blocking_gap: null,
          question_goal: "confirmar gravação",
          action_direction: "gravar o plano",
        },
      },
      next_phase: "sintese",
      proposal: { type: "save_quarterly_plan", objectives: [] },
    });

    expect(result).toEqual([]);
  });

  it("blocks ready state without proposal and proposal before ready state", () => {
    expect(reasons({
      state_patch: {
        _adaptive: {
          readiness: "ready",
          confirmed_facts: [],
          blocking_gap: null,
          question_goal: "confirmar",
          action_direction: "gravar",
        },
      },
    })).toContain("ready_without_proposal");

    expect(reasons({ proposal: { type: "save_quarterly_plan" } })).toContain("proposal_before_ready");
  });

  it("validates confirmed facts against the canonical session state", () => {
    expect(reasons({
      state_patch: {
        prioridade: "receita",
        _adaptive: {
          readiness: "partial",
          confirmed_facts: ["prioridade", "prazo_inventado"],
          blocking_gap: "prazo",
          question_goal: "definir prazo",
          action_direction: "calendarizar a ação",
        },
      },
    })).toContain("unverified_confirmed_facts");

    expect(reasons({
      state_patch: {
        _adaptive: {
          readiness: "partial",
          confirmed_facts: ["objetivo_existente"],
          blocking_gap: "prazo",
          question_goal: "definir prazo",
          action_direction: "calendarizar a ação",
        },
      },
    }, { sessionState: { objetivo_existente: "Implantar o CRM" } })).not.toContain("unverified_confirmed_facts");
  });

  it("blocks phase advancement without a new canonical fact", () => {
    expect(reasons({ next_phase: "diagnostico" })).toContain("phase_advance_without_evidence");
    expect(reasons({
      next_phase: "diagnostico",
      state_patch: {
        desafio_principal: "Baixa conversão",
        _adaptive: {
          readiness: "partial",
          confirmed_facts: ["desafio_principal"],
          blocking_gap: "prioridade",
          question_goal: "definir prioridade",
          action_direction: "escolher o foco",
        },
      },
    })).not.toContain("phase_advance_without_evidence");
  });

  it("keeps the current phase when the rejected response advances without evidence or regresses", () => {
    expect(safeAdaptiveNextPhase("abertura", "diagnostico", phases, ["phase_advance_without_evidence"])).toBe("abertura");
    expect(safeAdaptiveNextPhase("diagnostico", "abertura", phases, ["backward_phase"])).toBe("diagnostico");
    expect(safeAdaptiveNextPhase("abertura", "diagnostico", phases, [])).toBe("diagnostico");
  });

  it("blocks phase regression", () => {
    expect(reasons({ next_phase: "abertura" }, { currentPhase: "diagnostico" })).toContain("backward_phase");
  });

  it("blocks a generic restart after an explicit synthesis request", () => {
    expect(reasons({
      reply: "Vamos organizar isso. Qual é o principal desafio?",
      state_patch: {
        _adaptive: {
          readiness: "partial",
          confirmed_facts: ["meta", "prazo"],
          blocking_gap: "responsável",
          question_goal: "definir responsável",
          action_direction: "atribuir execução",
        },
      },
    }, { userMessage: "Já informei tudo; pode gerar a proposta final." })).toContain("ignored_completion_request");
  });

  it("forces corrected adaptive metadata after a rejected second attempt", () => {
    const corrected = ensureAdaptiveStatePatch(
      { objetivo: "Implantar o CRM", ...envelope().state_patch },
      "Objetivo e prazo definidos",
      false,
      true,
    ) as Record<string, any>;

    expect(corrected._adaptive.readiness).toBe("vague");
    expect(corrected._adaptive.confirmed_facts).toContain("objetivo");
    expect(corrected._adaptive.action_direction).toBe("transformar a resposta em acao");
  });

  it("produces deterministic fallbacks with at most one question and no internal leak", () => {
    const followUp = adaptiveFallbackReply(false, false);
    const confirmation = adaptiveFallbackReply(true, false);
    const pause = adaptiveFallbackReply(false, true);

    expect(visibleQuestions(followUp)).toHaveLength(1);
    expect(visibleQuestions(confirmation)).toHaveLength(1);
    expect(visibleQuestions(pause)).toHaveLength(0);
    expect([followUp, confirmation, pause].join(" ")).not.toMatch(/state_patch|base_confirmada|proposal/i);
  });

  it("preserves a useful summary when the rejection is only stylistic", () => {
    const summary = adaptiveFallbackReply(true, false, ["mechanical_acknowledgement"], {
      rejectedReply: "Entendi. **Resultado:** elevar adoção de 40% para 60%. Posso gravar?",
      userMessage: "Elevar adoção de 40% para 60%.",
    });
    const grounded = adaptiveFallbackReply(false, false, ["ungrounded_question"], {
      rejectedReply: "Qual é a meta?",
      userMessage: "A margem caiu mesmo com o volume estável.",
    });

    expect(summary).toContain("elevar adoção de 40% para 60%");
    expect(summary).not.toMatch(/^Entendi/);
    expect(grounded).toContain("A margem caiu");
    expect(visibleQuestions(grounded)).toHaveLength(1);
  });

  it("preserves a safe strategic question when only the internal state is rejected", () => {
    const reply = adaptiveFallbackReply(false, false, ["backward_phase", "incomplete_adaptive_state"], {
      rejectedReply: "Fazer uma campanha é uma atividade, não o resultado anual. Crescer 2% resolve a queda de margem ou precisamos mirar uma mudança maior?",
      userMessage: "Quero fazer uma campanha e crescer 2%.",
    });

    expect(reply).toContain("atividade, não o resultado anual");
    expect(reply).toContain("Crescer 2%");
    expect(visibleQuestions(reply)).toHaveLength(1);
  });

  it("does not preserve a visibly unsafe reply", () => {
    const reply = adaptiveFallbackReply(false, false, ["multiple_questions"], {
      rejectedReply: "Qual é a meta? Qual é o prazo?",
      userMessage: "Quero crescer.",
    });

    expect(reply).not.toContain("Qual é a meta?");
    expect(visibleQuestions(reply)).toHaveLength(1);
  });

  it("summarizes monthly and review proposals in the single fallback confirmation", () => {
    const monthly = adaptiveFallbackReply(true, false, ["proposal_confirmation_count"], {
      sessionType: "monthly",
      proposal: {
        type: "save_monthly_plan",
        objectives: [{ result: "elevar adoção do CRM de 40% para 60%" }],
      },
    });
    const review = adaptiveFallbackReply(true, false, ["proposal_confirmation_count"], {
      sessionType: "strategic_review",
      proposal: {
        type: "apply_strategic_review",
        adjustments: [{ title: "Aumentar previsibilidade", from: "52%", to: "45%", because: "o fechamento mudou" }],
      },
    });

    expect(monthly).toContain("elevar adoção do CRM de 40% para 60%");
    expect(review).toContain("Aumentar previsibilidade");
    expect(review).toContain("52% para 45%");
    expect(review).toContain("os demais objetivos e campos permanecem iguais");
    expect(review).toContain("Confirma aplicar este microajuste?");
    expect(visibleQuestions(monthly)).toHaveLength(1);
    expect(visibleQuestions(review)).toHaveLength(1);
  });

  it("rejects an empty annual proposal with the wrong year and asks for the concrete block", () => {
    const envelope = {
      reply: "O plano anual ficou pronto. Posso gravar?",
      state_patch: {
        tema: "crescer com previsibilidade",
        _adaptive: {
          readiness: "ready",
          confirmed_facts: ["tema"],
          blocking_gap: null,
          question_goal: "confirmar gravacao",
          action_direction: "gravar plano",
        },
      },
      proposal: {
        type: "save_strategic_plan",
        year: 2026,
        objectives: [],
        projects: [],
      },
    };
    const reasons = validateAdaptiveEnvelope({
      envelope,
      sessionType: "strategic",
      sessionPeriod: "2027",
      currentPhase: "sintese",
      phases: ["abertura", "sintese"],
      previousOracleReply: "Pode mandar o bloco completo?",
      userMessage: "Quatro objetivos e quatro projetos estao definidos.",
      sessionState: {},
    });
    const recovered = recoverAdaptiveEnvelopeAfterRepairFailure({
      envelope,
      reasons,
      sessionType: "strategic",
      currentPhase: "sintese",
      phases: ["abertura", "sintese"],
      userMessage: "Quatro objetivos e quatro projetos estao definidos.",
      sessionState: {},
    });

    expect(reasons).toContain("strategic_wrong_year");
    expect(reasons).toContain("strategic_incomplete_proposal");
    expect(recovered.proposal).toBeNull();
    expect(recovered.reply).toContain("valores concretos");
    expect(recovered.reply).toContain("não vou montar um plano vazio");
    expect(visibleQuestions(recovered.reply)).toHaveLength(1);
  });

  it("challenges an annual activity and a weak target instead of using the generic fallback", () => {
    const reply = adaptiveFallbackReply(false, false, ["multiple_questions"], {
      sessionType: "strategic",
      rejectedReply: "Qual é a meta? Qual é o prazo?",
      userMessage: "Quero colocar 'fazer uma campanha' como objetivo e crescer 2%, mas não sei se o problema é margem, volume ou previsibilidade.",
    });

    expect(reply).toContain("descreve o meio");
    expect(reply).toContain("2%");
    expect(reply).toContain("margem, volume ou previsibilidade");
    expect(visibleQuestions(reply)).toHaveLength(1);
  });

  it("keeps an unsupported year out of strategic historical lessons", () => {
    const normalized = normalizeStrategicHistoricalLessons({
      proposal: {
        type: "save_strategic_plan",
        year: 2027,
        historicalLessons: [
          "A meta de entregas em 2026 fechou abaixo do esperado",
          "O plano atual de 2027 limita quatro objetivos",
        ],
      },
    }, "O ciclo anterior fechou abaixo da meta. O plano atual e 2027.");
    const lessons = (normalized.proposal as any).historicalLessons as string[];

    expect(lessons[0]).toContain("no ciclo anterior");
    expect(lessons[0]).not.toContain("2026");
    expect(lessons[1]).toContain("2027");
  });

  it("turns a vague annual growth aspiration into a contextual strategic choice", () => {
    const vague = adaptiveFallbackReply(false, false, ["vague_without_options"], {
      sessionType: "strategic",
      rejectedReply: "Qual resultado faria a maior diferença?",
      userMessage: "Queremos crescer no próximo ano.",
    });
    const constrained = adaptiveFallbackReply(false, false, ["fact_block_misclassified"], {
      sessionType: "strategic",
      rejectedReply: "Qual é a principal dor?",
      userMessage: "A receita atual é estável, mas a margem varia e a capacidade de entrega limita o crescimento.",
    });

    for (const reply of [vague, constrained]) {
      expect(reply).toMatch(/receita/i);
      expect(reply).toMatch(/margem/i);
      expect(reply).toMatch(/capacidade/i);
      expect(reply).not.toContain("resultado, o prazo, o responsável ou a primeira ação");
      expect(visibleQuestions(reply)).toHaveLength(1);
    }
    expect(constrained).toMatch(/tens[aã]o|limite|escolha/i);
    expect(constrained).toContain("não será prioridade agora");
  });

  it("rejects a growth menu that omits the capacity trade-off", () => {
    const blocked = reasons({
      reply: "Crescer pode vir por receita na carteira, novos mercados ou margem. Qual caminho parece prioritário?",
    }, { sessionType: "strategic", userMessage: "Queremos crescer no próximo ano." });

    expect(blocked).toContain("strategic_growth_choice_incomplete");
  });

  it("turns a known growth tension into a trade-off instead of repeating the menu", () => {
    const userMessage = "A receita atual é estável, mas a margem varia e a capacidade de entrega limita o crescimento.";
    const blocked = reasons({
      reply: "Com receita estável, margem oscilando e capacidade limitada, qual caminho prioriza: receita, margem ou capacidade?",
    }, { sessionType: "strategic", userMessage });

    expect(blocked).toContain("strategic_growth_tension_unchallenged");
    const fallback = adaptiveFallbackReply(false, false, blocked, {
      rejectedReply: "Com receita estável, margem oscilando e capacidade limitada, qual caminho prioriza: receita, margem ou capacidade?",
      sessionType: "strategic",
      userMessage,
    });
    expect(fallback).toContain("não será prioridade agora");
    expect(visibleQuestions(fallback)).toHaveLength(1);
  });

  it("requires a final tension check when the annual portfolio fills limited capacity", () => {
    const userMessage = [
      "Perfil industrial com capacidade de entrega limitada.",
      "Tema: crescimento com disciplina.",
      "Objetivo 1: receita.",
      "Objetivo 2: margem.",
      "Objetivo 3: entrega.",
      "Objetivo 4: dados.",
      "Renuncias: adiar novo canal.",
    ].join("\n");
    const proposal = {
      type: "save_strategic_plan",
      year: 2027,
      themes: ["crescer com disciplina"],
      renunciations: ["adiar novo canal"],
      risks: ["dependência de fornecedores"],
      rituals: ["revisão mensal"],
      objectives: [{ metric: "receita", current: "R$ 120 milhões", target: "R$ 132 milhões" }],
      projects: [{ name: "disciplina comercial" }],
    };
    const blocked = reasons({
      reply: "O plano anual está completo com quatro objetivos e quatro projetos. Posso gravar?",
      proposal,
      state_patch: {
        _adaptive: {
          readiness: "ready",
          confirmed_facts: [],
          blocking_gap: null,
          question_goal: "confirmar gravação",
          action_direction: "gravar plano",
        },
      },
      next_phase: "sintese",
    }, { sessionType: "strategic", userMessage });

    expect(blocked).toContain("strategic_final_tension_missing");
    expect(blocked).not.toContain("strategic_growth_choice_incomplete");
    const fallback = adaptiveFallbackReply(true, false, blocked, {
      userMessage,
      proposal,
      sessionType: "strategic",
      rejectedReply: "Plano 2027 completo com tema, quatro objetivos, projetos e rituais. Confirma para gravar assim?",
    });
    expect(fallback).toContain("capacidade restrita");
    expect(fallback).toContain("R$ 120 milhões para R$ 132 milhões");
    expect(fallback).toContain("adiar novo canal");
    expect(visibleQuestions(fallback)).toHaveLength(1);

    const normalized = normalizeReadyProposalEnvelope({
      envelope: envelope({
        reply: "Plano 2027 completo com tema, quatro objetivos, projetos e rituais. Confirma para gravar assim?",
        proposal,
        state_patch: {
          _adaptive: {
            readiness: "ready",
            confirmed_facts: [],
            blocking_gap: null,
            question_goal: "confirmar gravação",
            action_direction: "gravar plano",
          },
        },
        next_phase: "sintese",
      }),
      reasons: blocked,
      sessionType: "strategic",
      currentPhase: "abertura",
      phases,
      userMessage,
      sessionState: {},
    });
    expect(normalized?.reply).toContain("capacidade restrita");
    expect(validateAdaptiveEnvelope({
      envelope: normalized ?? {},
      sessionType: "strategic",
      currentPhase: "abertura",
      phases,
      previousOracleReply: "Qual caminho deve liderar o ano?",
      userMessage,
    })).not.toContain("strategic_final_tension_missing");
  });

  it("normalizes proposal envelope hygiene without regenerating the full annual plan", () => {
    const proposal = { type: "save_strategic_plan", year: 2027, objectives: [{ title: "Elevar margem" }] };
    const malformed = envelope({
      reply: "A proposal está pronta. Confirmo? Ou quer revisar?",
      proposal,
      state_patch: { objective: "Elevar margem" },
      next_phase: "sintese",
    });
    const initialReasons = validateAdaptiveEnvelope({
      envelope: malformed,
      sessionType: "strategic",
      currentPhase: "diagnostico",
      phases,
      sessionState: {},
      previousOracleReply: "Qual caminho deve liderar o ano?",
      userMessage: "Dados concretos adicionais confirmados para completar o plano anual.",
    });
    const normalized = normalizeReadyProposalEnvelope({
      envelope: malformed,
      reasons: initialReasons,
      sessionType: "strategic",
      currentPhase: "diagnostico",
      phases,
      userMessage: "Dados concretos adicionais confirmados para completar o plano anual.",
      sessionState: {},
    });

    expect(normalized?.proposal).toBe(proposal);
    expect(normalized?.reply).toBe("O plano anual ficou pronto com as escolhas que você fez. Posso gravar?");
    expect(visibleQuestions(String(normalized?.reply))).toHaveLength(1);
    expect(validateAdaptiveEnvelope({
      envelope: normalized ?? {},
      sessionType: "strategic",
      currentPhase: "diagnostico",
      phases,
      sessionState: {},
      previousOracleReply: "Qual caminho deve liderar o ano?",
      userMessage: "Dados concretos adicionais confirmados para completar o plano anual.",
    })).toEqual([]);
  });

  it("keeps semantic or proposal-content defects on the model repair path", () => {
    const proposal = { type: "save_quarterly_plan", objectives: [] };
    expect(normalizeReadyProposalEnvelope({
      envelope: { reply: "Posso gravar?", proposal },
      reasons: ["quarterly_missing_objectives"],
      sessionType: "quarterly",
      currentPhase: "diagnostico",
      phases,
      userMessage: "Pode montar.",
      sessionState: {},
    })).toBeNull();
  });

  it("does not promote a premature proposal without readiness or an explicit completion cue", () => {
    expect(normalizeReadyProposalEnvelope({
      envelope: {
        reply: "Posso gravar?",
        proposal: { type: "save_strategic_plan", objectives: [{ title: "Crescer" }] },
        state_patch: {
          _adaptive: {
            readiness: "partial",
            confirmed_facts: [],
            blocking_gap: "indicador",
            question_goal: "definir indicador",
            action_direction: "tornar o objetivo verificavel",
          },
        },
      },
      reasons: ["proposal_before_ready"],
      sessionType: "strategic",
      currentPhase: "diagnostico",
      phases,
      userMessage: "Ainda estou pensando no crescimento.",
      sessionState: {},
    })).toBeNull();
  });

  it("forces a quarterly trade-off when priorities exceed capacity", () => {
    const reply = adaptiveFallbackReply(false, false, ["incomplete_adaptive_state"], {
      sessionType: "quarterly",
      userMessage: "Tenho oito prioridades, mas a equipe comporta duas.",
    });

    expect(reply).toContain("mais prioridades do que capacidade");
    expect(reply).toContain("objetivo anual");
    expect(visibleQuestions(reply)).toHaveLength(1);
  });

  it("challenges an overloaded quarterly portfolio with the relevant history", () => {
    const prepared = challengeQuarterlyPriorityOverload({
      envelope: envelope({ reply: "O que destrava o avanço agora?" }),
      sessionType: "quarterly",
      currentPhase: "abertura",
      sessionState: {},
      userMessage: "Tenho oito objetivos igualmente importantes para Operacoes neste trimestre.",
      planContext: "No trimestre anterior, seis prioridades dividiram a equipe e apenas uma foi concluida.",
    });
    const blocked = validateAdaptiveEnvelope({
      envelope: prepared,
      sessionType: "quarterly",
      currentPhase: "abertura",
      phases,
      sessionState: {},
      conversationText: "",
      previousOracleReply: "Neste trimestre, qual mudança faria diferença?",
      userMessage: "Tenho oito objetivos igualmente importantes para Operacoes neste trimestre.",
    });

    expect(prepared.reply).toContain("Oito objetivos igualmente importantes não cabem");
    expect(prepared.reply).toContain("seis prioridades dividiram a equipe");
    expect(prepared.reply).toContain("só uma foi concluída");
    expect(prepared.reply).toContain("no máximo três resultados");
    expect(prepared.reply).toContain("backlog");
    expect(visibleQuestions(String(prepared.reply))).toHaveLength(1);
    expect(prepared.proposal).toBeNull();
    expect(blocked).toEqual([]);
  });

  it("turns a vague quarterly improvement into a business diagnosis", () => {
    const userMessage = "Precisamos melhorar o Comercial neste trimestre.";
    const blocked = reasons({
      reply: "O que destrava o avanço agora: resultado, prazo, responsável ou primeira ação?",
    }, { sessionType: "quarterly", userMessage });
    const fallback = adaptiveFallbackReply(false, false, blocked, {
      sessionType: "quarterly",
      userMessage,
    });

    expect(blocked).toContain("quarterly_vague_diagnosis_missing");
    expect(fallback).toMatch(/demanda|convers[aã]o|previsibilidade/i);
    expect(fallback).not.toContain("prazo");
    expect(visibleQuestions(fallback)).toHaveLength(1);
  });

  it("turns a quarterly CRM activity into a measurable business result", () => {
    const userMessage = "Nosso objetivo do trimestre e implantar um CRM.";
    const blocked = reasons({
      reply: "O que destrava o avanço agora: fechar o resultado, o prazo, o responsável ou a primeira ação?",
    }, { sessionType: "quarterly", userMessage });
    const fallback = adaptiveFallbackReply(false, false, blocked, {
      sessionType: "quarterly",
      userMessage,
    });
    const accepted = reasons({
      reply: "Implantar o CRM é o meio. Qual resultado ele precisa produzir: previsibilidade do funil, velocidade do acompanhamento ou adoção pela equipe?",
    }, { sessionType: "quarterly", userMessage });

    expect(blocked).toContain("quarterly_activity_unchallenged");
    expect(fallback).toMatch(/meio/i);
    expect(fallback).toMatch(/previsibilidade|ado[cç][aã]o/i);
    expect(fallback).not.toContain("prazo");
    expect(visibleQuestions(fallback)).toHaveLength(1);
    expect(accepted).not.toContain("quarterly_activity_unchallenged");
  });

  it("defines the productivity measure before calculating a percentage without baseline", () => {
    const opening = "Quero aumentar a produtividade em vinte por cento neste trimestre.";
    const openingBlocked = reasons({
      reply: "O que destrava o avanço agora: fechar o resultado, o prazo, o responsável ou a primeira ação?",
    }, { sessionType: "quarterly", userMessage: opening });
    const openingFallback = adaptiveFallbackReply(false, false, openingBlocked, {
      sessionType: "quarterly",
      userMessage: opening,
    });

    expect(openingBlocked).toContain("quarterly_productivity_measure_missing");
    expect(openingFallback).toMatch(/medida|indicador/i);
    expect(openingFallback).not.toContain("prazo");
    expect(visibleQuestions(openingFallback)).toHaveLength(1);

    const ambiguity = [
      "O gestor ainda nao sabe qual medida de produtividade sera usada.",
      "Existem duas fontes possiveis: unidades por hora e pedidos concluidos por pessoa.",
      "Nenhum baseline foi confirmado.",
    ].join("\n");
    const ambiguityBlocked = reasons({
      reply: "Já temos uma parte importante definida. O que destrava o avanço agora: resultado, prazo, responsável ou ação?",
      state_patch: {
        _adaptive: {
          readiness: "partial",
          confirmed_facts: [],
          blocking_gap: "medida",
          question_goal: "definir medida",
          action_direction: "tornar a meta verificavel",
        },
      },
    }, { sessionType: "quarterly", userMessage: ambiguity });
    const ambiguityFallback = adaptiveFallbackReply(false, false, ambiguityBlocked, {
      sessionType: "quarterly",
      userMessage: ambiguity,
    });

    expect(ambiguityBlocked).toContain("quarterly_productivity_measure_missing");
    expect(ambiguityFallback).toContain("unidades por hora");
    expect(ambiguityFallback).toContain("pedidos concluidos por pessoa");
    expect(visibleQuestions(ambiguityFallback)).toHaveLength(1);
    expect(reasons({
      reply: "Temos duas medidas possíveis: unidades por hora e pedidos concluidos por pessoa. Qual delas representa melhor a produtividade deste trimestre?",
      state_patch: {
        _adaptive: {
          readiness: "partial",
          confirmed_facts: [],
          blocking_gap: "medida",
          question_goal: "escolher medida",
          action_direction: "definir formula e depois baseline",
        },
      },
    }, { sessionType: "quarterly", userMessage: ambiguity })).not.toContain("quarterly_productivity_measure_missing");
  });

  it("investigates the cause before jumping from impact to annual alignment", () => {
    const userMessage = "A dor é a previsão inconsistente, com impacto em estoque e caixa.";
    const blocked = reasons({
      reply: "Não há plano anual. Quer seguir com uma exceção consciente?",
    }, { sessionType: "quarterly", userMessage });
    const fallback = adaptiveFallbackReply(false, false, blocked, {
      sessionType: "quarterly",
      userMessage,
    });

    expect(blocked).toContain("quarterly_cause_bypassed");
    expect(fallback).toContain("causa");
    expect(fallback).toMatch(/processo|dados|rotina/i);
    expect(visibleQuestions(fallback)).toHaveLength(1);
  });

  it("uses history before offering hypotheses for a recurring quarterly goal", () => {
    const userMessage = "Vamos manter a meta de reduzir retrabalho para cinco por cento.";
    const blocked = reasons({
      reply: "Manter reduzir retrabalho para 5% como meta principal. Qual caminho priorizamos: padronizar aprovação, revisar qualidade ou treinar a equipe?",
    }, { sessionType: "quarterly", userMessage });
    const fallback = adaptiveFallbackReply(false, false, blocked, {
      sessionType: "quarterly",
      userMessage,
    });
    const accepted = reasons({
      reply: "Essa meta está voltando. O que precisa ser diferente agora com base no ciclo anterior?",
    }, { sessionType: "quarterly", userMessage });

    expect(blocked).toContain("quarterly_repeated_goal_unchallenged");
    expect(fallback).toContain("meta está voltando");
    expect(fallback).toMatch(/causa|abordagem|evid[eê]ncia/i);
    expect(fallback).not.toMatch(/padronizar|treinar/i);
    expect(visibleQuestions(fallback)).toHaveLength(1);
    expect(accepted).not.toContain("quarterly_repeated_goal_unchallenged");
  });

  it("does not reinterview indicator or baseline after recurring-goal facts are confirmed", () => {
    const userMessage = [
      "Dois ciclos anteriores terminaram em onze e nove por cento de retrabalho.",
      "A causa confirmada e falta de padrao na etapa de aprovacao.",
      "A nova abordagem e checklist obrigatorio com auditoria amostral semanal.",
    ].join("\n");
    const blocked = reasons({
      reply: "Causa e nova abordagem confirmadas. Qual o indicador exato e a baseline atual?",
    }, { sessionType: "quarterly", userMessage });
    const fallback = adaptiveFallbackReply(false, false, blocked, {
      sessionType: "quarterly",
      userMessage,
    });

    expect(blocked).toContain("quarterly_repeated_goal_reinterview");
    expect(blocked).toContain("quarterly_repeated_goal_memory_omitted");
    expect(fallback).toContain("Dois ciclos anteriores terminaram em onze e nove por cento");
    expect(fallback).toContain("causa e a nova abordagem");
    expect(fallback).toContain("evidência intermediária");
    expect(visibleQuestions(fallback)).toHaveLength(1);
  });

  it("challenges a nearly complete quarterly block once without reopening the resolved area", () => {
    const userMessage = [
      "Dados concretos adicionais confirmados pelo gestor sintetico para fechar o plano trimestral:",
      "- Resultado principal confirmado: elevar entregas no prazo de 82% para 92% ate 30/09/2027, fonte relatorio de expedicao.",
      "- Responsavel: PERSON_FIXTURE_MANAGER. Periodo: T3 2027.",
      "- Acao 1: publicar o padrao operacional ate 31/07/2027; criterio: padrao aprovado e acessivel.",
      "- Acao 2: revisar semanalmente as excecoes ate 30/09/2027; criterio: doze revisoes registradas.",
      "- Risco: baixa adesao. Mitigacao: acompanhamento semanal. Foco de aprendizado: validar a padronizacao.",
    ].join("\n");
    const readyEnvelope = {
      reply: "O plano trimestral ficou pronto. Posso gravar?",
      proposal: { type: "save_quarterly_plan", quarterlyObjectives: [{ result: "Elevar entregas no prazo" }] },
      state_patch: {
        resultado: "Elevar entregas no prazo",
        _adaptive: {
          readiness: "ready",
          confirmed_facts: ["resultado"],
          blocking_gap: null,
          question_goal: "confirmar gravacao",
          action_direction: "gravar plano",
        },
      },
      next_phase: "sintese",
    };
    const blocked = reasons(readyEnvelope, {
      sessionType: "quarterly",
      userMessage,
      conversationText: "oracle: Qual a primeira acao executavel que comeca a mover essa metrica?",
    });
    const fallback = adaptiveFallbackReply(false, false, blocked, {
      sessionType: "quarterly",
      userMessage,
    });
    const accepted = reasons(readyEnvelope, {
      sessionType: "quarterly",
      userMessage,
      conversationText: "oracle: A meta esta clara. Qual evidencia intermediaria vai provar, antes do fechamento, que as acoes mudam o resultado?",
    });

    expect(blocked).toContain("quarterly_complete_block_unchallenged");
    expect(fallback).toContain("82% para 92%");
    expect(fallback).toContain("evidência intermediária");
    expect(fallback).not.toMatch(/qual (?:e|é) a [aá]rea/i);
    expect(visibleQuestions(fallback)).toHaveLength(1);
    expect(accepted).not.toContain("quarterly_complete_block_unchallenged");
  });

  it("defers a ready quarterly proposal locally instead of requiring a second model call", () => {
    const userMessage = [
      "Dados concretos adicionais confirmados pelo gestor sintetico para fechar o plano trimestral:",
      "- Resultado principal confirmado: elevar oportunidades com proxima acao registrada de 40% para 85% ate 30/09/2027, fonte relatorio semanal do funil.",
      "- Responsavel: PERSON_FIXTURE_MANAGER. Periodo: T3 2027.",
      "- Acao 1: publicar o padrao operacional ate 31/07/2027; criterio: padrao aprovado e acessivel.",
      "- Acao 2: revisar semanalmente as excecoes ate 30/09/2027; criterio: doze revisoes registradas.",
      "- Risco: baixa adesao. Mitigacao: acompanhamento semanal. Foco de aprendizado: validar a padronizacao.",
    ].join("\n");
    const readyEnvelope = {
      reply: "O plano trimestral ficou pronto. Posso gravar?",
      proposal: { type: "save_quarterly_plan", quarterlyObjectives: [{ result: "Elevar oportunidades" }] },
      done: true,
      state_patch: {
        resultado: "Elevar oportunidades",
        _adaptive: {
          readiness: "ready",
          confirmed_facts: ["resultado"],
          blocking_gap: null,
          question_goal: "confirmar gravacao",
          action_direction: "gravar plano",
        },
      },
      next_phase: "sintese",
    };
    const prepared = deferUnchallengedQuarterlyProposal({
      envelope: readyEnvelope,
      sessionType: "quarterly",
      currentPhase: "diagnostico",
      sessionState: {},
      conversationText: "oracle: O que o CRM precisa mudar no resultado?",
      userMessage,
    });
    const preparedReasons = validateAdaptiveEnvelope({
      envelope: prepared,
      sessionType: "quarterly",
      currentPhase: "diagnostico",
      phases,
      sessionState: {},
      conversationText: "oracle: O que o CRM precisa mudar no resultado?",
      previousOracleReply: "O que o CRM precisa mudar no resultado?",
      userMessage,
    });

    expect(prepared.proposal).toBeNull();
    expect(prepared.done).toBe(false);
    expect(prepared.next_phase).toBe("diagnostico");
    expect(prepared.reply).toContain("40% para 85%");
    expect(prepared.reply).toContain("evidência intermediária");
    expect(visibleQuestions(String(prepared.reply))).toHaveLength(1);
    expect(preparedReasons).toEqual([]);
  });

  it("keeps a quarterly proposal after the strategic challenge already happened", () => {
    const userMessage = [
      "Dados concretos adicionais confirmados para fechar o plano trimestral:",
      "- Resultado principal: elevar entregas no prazo de 82% para 92%, fonte expedicao.",
      "- Responsavel: Diego. Periodo: T3 2027.",
      "- Acao 1: publicar padrao; criterio: padrao aprovado.",
      "- Acao 2: revisar excecoes; criterio: doze revisoes.",
      "- Risco: baixa adesao. Mitigacao: acompanhamento semanal.",
    ].join("\n");
    const readyEnvelope = {
      reply: "O plano ficou pronto. Posso gravar?",
      proposal: { type: "save_quarterly_plan" },
      state_patch: {},
      next_phase: "sintese",
    };
    const prepared = deferUnchallengedQuarterlyProposal({
      envelope: readyEnvelope,
      sessionType: "quarterly",
      currentPhase: "diagnostico",
      conversationText: "oracle: Qual evidência intermediária vai provar, antes do fechamento, que as ações mudam o resultado?",
      userMessage,
    });

    expect(prepared).toBe(readyEnvelope);
    expect(prepared.proposal).toEqual({ type: "save_quarterly_plan" });
  });

  it("keeps the session open with a safe question when the repair envelope is invalid", () => {
    const recovered = recoverAdaptiveEnvelopeAfterRepairFailure({
      envelope: null,
      reasons: ["invalid_json_envelope"],
      sessionType: "quarterly",
      currentPhase: "diagnostico",
      phases,
      userMessage: "Continue com a proxima pergunta realmente necessaria.",
      sessionState: { resultado: "Elevar entregas no prazo" },
    });
    const recoveredReasons = validateAdaptiveEnvelope({
      envelope: recovered,
      sessionType: "quarterly",
      currentPhase: "diagnostico",
      phases,
      sessionState: { resultado: "Elevar entregas no prazo" },
      conversationText: "",
      previousOracleReply: "",
      userMessage: "Continue com a proxima pergunta realmente necessaria.",
    });

    expect(recovered.proposal).toBeUndefined();
    expect(recovered.done).toBe(false);
    expect(recovered.next_phase).toBe("diagnostico");
    expect(recovered.reply).not.toMatch(/erro|tente novamente/i);
    expect(visibleQuestions(String(recovered.reply))).toHaveLength(1);
    expect(recoveredReasons).toEqual([]);
  });

  it("requires the quarterly proposal after the manager chooses to proceed past the challenge", () => {
    const conversationText = "oracle: A meta de 82% para 92% esta clara. Qual evidencia intermediaria vai mostrar, antes do fechamento, que as acoes mudam o resultado?";
    const userMessage = "Considere tudo o que ja foi confirmado e apresente agora a proposta final para uma unica confirmacao.";
    const blocked = reasons({
      reply: "Você prefere definir a evidência intermediária ou seguir sem ela?",
      state_patch: {
        _adaptive: {
          readiness: "partial",
          confirmed_facts: [],
          blocking_gap: "evidencia",
          question_goal: "definir evidencia",
          action_direction: "validar abordagem",
        },
      },
    }, { sessionType: "quarterly", conversationText, userMessage });
    const accepted = reasons({
      reply: "O plano ficou pronto. Posso gravar?",
      proposal: { type: "save_quarterly_plan" },
      state_patch: {
        _adaptive: {
          readiness: "ready",
          confirmed_facts: [],
          blocking_gap: null,
          question_goal: "confirmar gravacao",
          action_direction: "gravar plano",
        },
      },
      next_phase: "sintese",
    }, { sessionType: "quarterly", conversationText, userMessage });
    const directive = buildAdaptiveRepairDirective(blocked, "Você prefere seguir sem evidência?");

    expect(blocked).toContain("quarterly_proceed_after_challenge_without_proposal");
    expect(accepted).not.toContain("quarterly_proceed_after_challenge_without_proposal");
    expect(directive).toContain("decisao de seguir sem evidencia adicional e consciente");
    expect(directive).toContain("save_quarterly_plan");
  });

  it("acknowledges the unique Industrial and Producao equivalence without adding a question", () => {
    const prepared = acknowledgeEquivalentQuarterlyArea({
      envelope: {
        reply: "Qual mudança faria mais diferença neste T3?",
        state_patch: {},
        next_phase: "abertura",
      },
      sessionType: "quarterly",
      userMessage: "Quero planejar o trimestre da Industrial.",
      planContext: [
        "MEMÓRIA ESTRATÉGICA (planos passados — referência):",
        "Plano anterior identificado como Industrial pertence a esta area.",
        "ÁREA EM FOCO: Produção (coordenador: Diego)",
      ].join("\n"),
    });

    expect(prepared.reply).toContain("Industrial corresponde à área Produção cadastrada");
    expect(prepared.reply).toContain("histórico equivalente dessa área permanece como referência");
    expect(visibleQuestions(String(prepared.reply))).toHaveLength(1);
  });

  it("builds a useful single-confirmation summary for a quarterly proposal", () => {
    const normalized = normalizeProposalConfirmationEnvelope({
      reply: "O plano ficou pronto. Posso gravar?",
      proposal: {
        type: "save_quarterly_plan",
        learningFocus: ["validar se o novo padrão reduz retrabalho"],
        cadence: "auditoria amostral semanal",
        quarterlyObjectives: [{
          result: "Reduzir retrabalho",
          current: "9%",
          target: "5%",
          source: "auditoria semanal da qualidade",
          deadline: "2027-09-30",
          owner: "Diego",
          actions: [{ description: "publicar padrão" }, { description: "auditar exceções" }],
        }],
      },
    }, "quarterly");
    const reply = String(normalized.reply);

    expect(reply).toContain("Reduzir retrabalho de 9% para 5%");
    expect(reply.match(/9% para 5%/g)).toHaveLength(1);
    expect(reply).toContain("Ações que mudam a abordagem");
    expect(reply).toContain("Foco de aprendizado");
    expect(reply).toContain("auditoria amostral semanal");
    expect(reply).toContain("2 ações");
    expect(visibleQuestions(reply)).toHaveLength(1);
  });

  it("summarizes identical transversal actions once across quarterly objectives", () => {
    const action = {
      description: "publicar o padrão operacional",
      owner: "Diego",
      deadline: "2027-07-31",
      completionCriterion: "padrão aprovado e acessível",
    };
    const normalized = normalizeProposalConfirmationEnvelope({
      proposal: {
        type: "save_quarterly_plan",
        quarterlyObjectives: ["Prazo", "Retrabalho", "Capacidade"].map((result) => ({
          result,
          current: "60%",
          target: "85%",
          actions: [action],
        })),
      },
    }, "quarterly");
    const reply = String(normalized.reply);

    expect((normalized.proposal as any).sharedActions).toEqual([action]);
    expect(reply.match(/publicar o padrão operacional/g)).toHaveLength(1);
    expect(reply).toContain("Execução: 1 ação");
    expect(visibleQuestions(reply)).toHaveLength(1);
  });

  it("summarizes an inherited monthly decision with origin, reason and new deadline", () => {
    const normalized = normalizeProposalConfirmationEnvelope({
      proposal: {
        type: "save_monthly_plan",
        quarterlyAlignment: { status: "linked", quarterlyObjectiveTitle: "Qualidade do funil" },
        pendingDecisions: [{
          item: "integração do CRM",
          origin: "Jun 2027",
          reason: "dependência do fornecedor",
          decision: "roll",
        }],
        objectives: [{
          title: "integração do CRM",
          result: "integração do CRM",
          metric: "oportunidades com próxima ação",
          current: "40%",
          target: "55%",
          actions: [{
            description: "Rolar a integração",
            deadline: "2027-07-20",
            completionCriterion: "integração validada e aceite registrado",
          }],
        }],
      },
    }, "monthly");
    const proposal = normalized.proposal as any;
    const reply = String(normalized.reply);

    expect(proposal.objectives[0].result).toBe("Elevar oportunidades com próxima ação de 40% para 55%");
    expect(proposal.cadence).toContain("dependência do fornecedor");
    expect(proposal.nextCommitment).toContain("2027-07-20");
    expect(reply).toContain("Jun 2027");
    expect(reply).toContain("dependência do fornecedor");
    expect(reply).toContain("2027-07-20");
    expect(visibleQuestions(reply)).toHaveLength(1);
  });

  it("summarizes monthly capacity, backlog and all committed actions once", () => {
    const normalized = normalizeProposalConfirmationEnvelope({
      proposal: {
        type: "save_monthly_plan",
        capacity: { maxCommittedActions: 5 },
        pendingDecisions: [],
        backlog: ["As demais demandas ficam no backlog do mês"],
        blockers: ["Adesão da equipe"],
        cadence: "Semanal",
        confidence: "amarela",
        objectives: [{
          result: "Elevar oportunidades com próxima ação de 40% para 55%",
          source: "Relatório semanal",
          owner: "Diego",
          deadline: "2027-07-31",
          actions: Array.from({ length: 5 }, (_, index) => ({
            description: `Ação ${index + 1}`,
            deadline: `2027-07-${String(index + 5).padStart(2, "0")}`,
            completionCriterion: `Critério ${index + 1}`,
            owner: "Diego",
          })),
        }],
      },
    }, "monthly");
    const reply = String(normalized.reply);

    expect(reply).toContain("Ações comprometidas (5/5)");
    expect(reply).toContain("Ação 1");
    expect(reply).toContain("Ação 5");
    expect(reply).toContain("critério Critério 5");
    expect(reply).toContain("Backlog:");
    expect(reply).toContain("Confiança: amarela");
    expect(visibleQuestions(reply)).toHaveLength(1);
  });

  it("grounds a discount objective in its current measure before suggesting actions", () => {
    const userMessage = "O objetivo e reduzir desconto medio e melhorar a qualidade da venda.";
    const blocked = reasons({
      reply: "Você prefere treinar o time, revisar alçadas ou mudar o mix?",
    }, { sessionType: "quarterly", userMessage });
    const fallback = adaptiveFallbackReply(false, false, blocked, {
      rejectedReply: "Você prefere treinar o time, revisar alçadas ou mudar o mix?",
      userMessage,
      sessionType: "quarterly",
    });

    expect(blocked).toContain("quarterly_discount_diagnosis_missing");
    expect(fallback).toContain("desconto médio atual");
    expect(fallback).toContain("onde ele é medido");
    expect(visibleQuestions(fallback)).toHaveLength(1);
  });

  it("explains the margin hypothesis and asks for an explicit KPI choice", () => {
    const userMessage = [
      "O Dashboard possui os KPIs Faturamento e Margem operacional.",
      "A hipotese e que reduzir desconto pode elevar margem, mas o efeito ainda nao esta comprovado.",
      "O gestor deve escolher se quer vincular o objetivo a Margem operacional.",
    ].join(" ");
    const blocked = reasons({
      reply: "O que destrava o avanço agora: resultado, prazo, responsável ou ação?",
    }, { sessionType: "quarterly", userMessage });
    const fallback = adaptiveFallbackReply(false, false, blocked, {
      rejectedReply: "O que destrava o avanço agora: resultado, prazo, responsável ou ação?",
      userMessage,
      sessionType: "quarterly",
    });

    expect(blocked).toContain("quarterly_kpi_hypothesis_choice_missing");
    expect(fallback).toContain("hipótese, não uma causalidade comprovada");
    expect(fallback).toContain("vincular este objetivo ao KPI existente Margem operacional");
    expect(visibleQuestions(fallback)).toHaveLength(1);
  });

  it("normalizes and displays a confirmed KPI hypothesis in the final summary", () => {
    const normalized = normalizeProposalConfirmationEnvelope({
      proposal: {
        type: "save_quarterly_plan",
        quarterlyObjectives: [{
          result: "Reduzir desconto médio",
          current: "14%",
          target: "9%",
          kpiLinks: [{ kpi: "Margem operacional", linkType: "hypothesis" }],
          actions: [{ description: "revisar exceções" }],
        }],
      },
    }, "quarterly");
    const proposal = normalized.proposal as any;
    const reply = String(normalized.reply);

    expect(proposal.quarterlyObjectives[0].kpiLinks[0].kpiKey).toBe("operating_margin");
    expect(reply).toContain("Hipótese de impacto confirmada");
    expect(reply).toContain("Margem operacional");
    expect(reply).toContain("efeito causal ainda não comprovado");
  });

  it("blocks an annual activity and self-declared weak target when they are accepted without challenge", () => {
    const userMessage = "Quero fazer uma campanha e crescer só 2%, mas não sei se o problema é margem, volume ou previsibilidade.";
    const unchallenged = reasons({
      reply: "Campanha com 2% é uma escolha concreta. Qual dor ela resolve: margem, volume ou previsibilidade?",
    }, { sessionType: "strategic", userMessage });
    const challenged = reasons({
      reply: "Fazer uma campanha é o meio, não o resultado, e a meta de 2% precisa provar que resolve a dor. Qual foco deve mudar: margem, volume ou previsibilidade?",
    }, { sessionType: "strategic", userMessage });

    expect(unchallenged).toContain("strategic_activity_unchallenged");
    expect(unchallenged).toContain("strategic_weak_target_unchallenged");
    expect(challenged).not.toContain("strategic_activity_unchallenged");
    expect(challenged).not.toContain("strategic_weak_target_unchallenged");
  });

  it("challenges system implementation as an annual means instead of accepting a generic field menu", () => {
    const userMessage = "O principal objetivo anual e implantar um novo sistema de gestao.";
    const unchallenged = reasons({
      reply: "O que destrava o avanço agora: fechar o resultado, o prazo, o responsável ou a primeira ação?",
    }, { sessionType: "strategic", userMessage });
    const fallback = adaptiveFallbackReply(false, false, unchallenged, {
      sessionType: "strategic",
      userMessage,
    });

    expect(unchallenged).toContain("strategic_activity_unchallenged");
    expect(unchallenged).toContain("strategic_generic_decision_question");
    expect(fallback).toContain("descreve o meio");
    expect(fallback).toContain("resultado empresarial");
  });

  it("blocks a jump to generic drivers after the manager already explains the cause", () => {
    const userMessage = "A margem caiu de 12% para 7% porque os descontos aumentaram e o mix piorou.";
    expect(reasons({
      reply: "A queda ficou clara. Qual é o propósito da empresa?",
    }, { sessionType: "strategic", userMessage })).toContain("strategic_diagnosis_jump");

    const fallback = adaptiveFallbackReply(false, false, ["strategic_diagnosis_jump"], {
      sessionType: "strategic",
      userMessage,
    });
    expect(fallback).toContain("causas concretas");
    expect(fallback).toContain("atacada primeiro");
    expect(visibleQuestions(fallback)).toHaveLength(1);
  });

  it("challenges a repeated annual goal instead of falling back to generic fields", () => {
    const userMessage = "Quero repetir a meta de 95% de entregas no prazo.";
    const blocked = reasons({
      reply: "Já temos uma parte importante. O que destrava o avanço agora: fechar o resultado, o prazo, o responsável ou a primeira ação?",
    }, { sessionType: "strategic", userMessage });
    const fallback = adaptiveFallbackReply(false, false, blocked, {
      sessionType: "strategic",
      userMessage,
    });

    expect(blocked).toContain("strategic_repeated_goal_unchallenged");
    expect(blocked).toContain("strategic_generic_decision_question");
    expect(fallback).toContain("meta de 95%");
    expect(fallback).toContain("ciclo anterior");
    expect(fallback).toContain("diferente agora");
    expect(visibleQuestions(fallback)).toHaveLength(1);
  });

  it("asks for one complete handoff instead of reinterviewing an experienced owner", () => {
    const userMessage = "Tenho o plano anual completo. Quero que você valide lacunas e monte a proposta sem repetir a entrevista.";
    const blocked = reasons({
      reply: "Qual é o principal resultado que você quer atingir?",
    }, { sessionType: "strategic", userMessage });
    const fallback = adaptiveFallbackReply(false, false, blocked, {
      sessionType: "strategic",
      userMessage,
    });

    expect(blocked).toContain("strategic_complete_plan_request_ignored");
    expect(fallback).toContain("bloco completo");
    expect(fallback).toContain("sem refazer a entrevista");
    expect(visibleQuestions(fallback)).toHaveLength(1);
  });

  it("does not restart initial questions after a rich annual fact block", () => {
    const userMessage = [
      "- O fechamento leva 12 dias e deve cair para 5.",
      "- Só 30% das áreas usam dados padronizados; a meta é 90%.",
      "- A fonte será o relatório mensal.",
    ].join("\n");
    const blocked = reasons({
      reply: "Qual é a principal dor da empresa hoje?",
      state_patch: {
        _adaptive: {
          readiness: "partial",
          confirmed_facts: [],
          blocking_gap: "prioridade",
          question_goal: "definir prioridade",
          action_direction: "escolher o resultado principal",
        },
      },
    }, { sessionType: "strategic", userMessage });
    const fallback = adaptiveFallbackReply(false, false, blocked, {
      sessionType: "strategic",
      userMessage,
    });

    expect(blocked).toContain("strategic_fact_block_restart");
    expect(fallback).toContain("dois efeitos mensuráveis");
    expect(fallback).toContain("liderar o objetivo anual");
  });

  it("asks for concrete values instead of naturalizing a restarted interview for an experienced owner", () => {
    const userMessage = [
      "- Tema: crescer com previsibilidade e disciplina.",
      "- Quatro objetivos com baseline, alvo, fonte e prazo.",
      "- Quatro projetos com dono, prazo e objetivo anual de apoio.",
    ].join("\n");
    const fallback = adaptiveFallbackReply(false, false, ["strategic_fact_block_restart"], {
      sessionType: "strategic",
      userMessage,
      rejectedReply: "Informações confirmadas. Qual a principal dor que o tema precisa resolver primeiro?",
    });

    expect(fallback).toContain("estrutura está completa");
    expect(fallback).toContain("valores e vínculos");
    expect(fallback).not.toContain("principal dor");
  });

  it("detects a restarted annual interview even when the question omits the verb", () => {
    const userMessage = [
      "- Tema: crescer com previsibilidade e disciplina.",
      "- Quatro objetivos com baseline, alvo, fonte e prazo.",
      "- Quatro projetos com dono e prazo.",
    ].join("\n");

    expect(reasons({
      reply: "Tema registrado. Qual a principal dor que esse foco precisa resolver primeiro?",
    }, { sessionType: "strategic", userMessage })).toContain("strategic_fact_block_restart");
  });

  it("repairs an incomplete annual proposal from the concrete block already in conversation", () => {
    const directive = buildAdaptiveRepairDirective(
      ["strategic_incomplete_proposal"],
      "O plano anual ficou pronto. Posso gravar?",
    );

    expect(directive).toContain("Releia o bloco concreto ja presente na conversa");
    expect(directive).toContain("title, type, result, current, metric, target, deadline, source, strategies, owner e period");
    expect(directive).toContain("Nao peca ao gestor para reenviar dados");
  });

  it("blocks invented percentage examples during annual diagnosis", () => {
    const blocked = reasons({
      reply: "Implantar o sistema é o meio. Pode mirar, por exemplo, faturamento 20% maior ou margem de 15%. Qual resultado importa?",
    }, { sessionType: "strategic", userMessage: "O objetivo anual é implantar um sistema de gestão." });

    expect(blocked).toContain("strategic_ungrounded_numeric_example");
  });

  it("removes a delegation pending decision that was never asked in the conversation", () => {
    const proposal = {
      type: "save_strategic_plan",
      year: 2027,
      objectives: [{ title: "Elevar margem" }],
      pendingDecisions: ["validar delegação ou retaguarda para a concentração de responsáveis"],
    };
    const malformed = envelope({
      reply: "O plano anual ficou pronto. Posso gravar?",
      proposal,
      state_patch: {
        objetivo: "Elevar margem",
        _adaptive: {
          readiness: "ready",
          confirmed_facts: ["objetivo"],
          blocking_gap: null,
          question_goal: "confirmar gravação",
          action_direction: "gravar o plano",
        },
      },
      next_phase: "sintese",
    });
    const blocked = validateAdaptiveEnvelope({
      envelope: malformed,
      sessionType: "strategic",
      currentPhase: "diagnostico",
      phases,
      sessionState: {},
      conversationText: "manager: quatro objetivos e quatro projetos completos",
      previousOracleReply: "Pode enviar os dados completos?",
      userMessage: "Dados concretos adicionais confirmados para completar o plano anual.",
    });
    const normalized = normalizeReadyProposalEnvelope({
      envelope: malformed,
      reasons: blocked,
      sessionType: "strategic",
      currentPhase: "diagnostico",
      phases,
      userMessage: "Dados concretos adicionais confirmados para completar o plano anual.",
      sessionState: {},
    });

    expect(blocked).toContain("strategic_unasked_pending_decision");
    expect((normalized?.proposal as any)?.pendingDecisions).toEqual([]);
  });

  it("finds the last oracle turn and gives repair instructions without exposing them to the user", () => {
    expect(latestOracleReply([
      { author: "oracle", text: "Primeira pergunta?" },
      { author: "user", text: "Resposta" },
      { author: "oracle", text: "Segunda pergunta?" },
    ])).toBe("Segunda pergunta?");

    const repair = buildAdaptiveRepairDirective(["repeated_question"], "Qual é o desafio?");
    expect(repair).toContain("repete semanticamente");
    expect(repair).toContain("Nao mencione esta correcao");
    expect(ADAPTIVE_SESSION_RULES).toContain("checklist de decisoes");
    expect(ADAPTIVE_SESSION_RULES).toContain("2 ou 3 possibilidades");
    expect(ADAPTIVE_SESSION_RULES).toContain("proxima acao executavel");
  });
});
