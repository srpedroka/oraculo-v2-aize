import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_SESSION_RULES,
  adaptiveFallbackReply,
  buildAdaptiveRepairDirective,
  ensureAdaptiveStatePatch,
  latestOracleReply,
  normalizeReadyProposalEnvelope,
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
    expect(visibleQuestions(monthly)).toHaveLength(1);
    expect(visibleQuestions(review)).toHaveLength(1);
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
