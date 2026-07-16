import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_SESSION_RULES,
  adaptiveFallbackReply,
  buildAdaptiveRepairDirective,
  ensureAdaptiveStatePatch,
  latestOracleReply,
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
