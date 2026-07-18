import { describe, expect, it } from "vitest";
import { matchingQuarterlyObjective, monthlyCapacityDecisionEnvelope, parseCompleteMonthlyReadyBlock } from "./monthly-ready-block.ts";
import { validateAdaptiveEnvelope } from "./session-adaptive.ts";

const completeBlock = `Dados concretos adicionais confirmados pelo gestor sintetico para fechar Jul 2027:
- Objetivo mensal: elevar oportunidades com proxima acao de 40% para 55% ate 31/07/2027; fonte relatorio semanal; responsavel PERSON_FIXTURE_MANAGER; vinculo ao objetivo trimestral de qualidade do funil.
- Acao 1: publicar checklist ate 05/07, criterio checklist aprovado; responsavel PERSON_FIXTURE_MANAGER.
- Acao 2: treinar aprovadores ate 10/07, criterio todos os aprovadores presentes; responsavel PERSON_FIXTURE_MANAGER.
- Acao 3: auditar vinte casos ate 20/07, criterio relatorio publicado; responsavel PERSON_FIXTURE_MANAGER.
- Acao 4: corrigir duas causas principais ate 25/07, criterio correcoes validadas; responsavel PERSON_FIXTURE_MANAGER.
- Acao 5: revisar indicador ate 31/07, criterio fechamento registrado; responsavel PERSON_FIXTURE_MANAGER.
- Acompanhamento semanal. Confianca amarela. Bloqueio principal: adesao da equipe. As demais demandas ficam no backlog do mes.`;

describe("complete monthly ready block Q4V", () => {
  it("extracts a complete capacity choice without inventing fields", () => {
    const parsed = parseCompleteMonthlyReadyBlock(completeBlock, "Jul 2027");

    expect(parsed).toMatchObject({
      result: "Elevar oportunidades com proxima acao de 40% para 55%",
      metric: "oportunidades com proxima acao",
      current: "40%",
      target: "55%",
      source: "relatorio semanal",
      deadline: "2027-07-31",
      owner: "PERSON_FIXTURE_MANAGER",
      quarterlyLinkHint: "qualidade do funil",
      cadence: "Semanal",
      confidence: "amarela",
      blocker: "Adesao da equipe",
      backlog: "As demais demandas ficam no backlog do mes",
    });
    expect(parsed?.actions).toHaveLength(5);
    expect(parsed?.actions[0]).toEqual({
      description: "Publicar checklist",
      completionCriterion: "Checklist aprovado",
      deadline: "2027-07-05",
      owner: "PERSON_FIXTURE_MANAGER",
    });
  });

  it("does not activate for an incomplete block or a deadline outside the month", () => {
    expect(parseCompleteMonthlyReadyBlock("Objetivo mensal: elevar adoção de 40% para 55%.", "Jul 2027")).toBeNull();
    expect(parseCompleteMonthlyReadyBlock(completeBlock.replace("05/07", "05/08"), "Jul 2027")).toBeNull();
  });

  it("links only one safe quarterly candidate", () => {
    const candidate = { id: "q-1", title: "Elevar qualidade do funil comercial", period: "T3 2027" };
    expect(matchingQuarterlyObjective("qualidade do funil", [candidate])).toEqual(candidate);
    expect(matchingQuarterlyObjective("qualidade do funil", [candidate, { id: "q-2", title: "Qualidade do funil de parceiros" }])).toBeNull();
    expect(matchingQuarterlyObjective("funil", [candidate])).toBeNull();
  });

  it("challenges overload with the previous overcommitment and one actionable question", () => {
    const message = [
      "A equipe tem capacidade estimada para cinco acoes relevantes.",
      "Tres acoes contribuem diretamente para o objetivo trimestral; duas reduzem risco operacional.",
      "As demais podem ser adiadas sem comprometer a meta do trimestre.",
    ].join("\n");
    const envelope = monthlyCapacityDecisionEnvelope(
      { type: "monthly" },
      message,
      "Mes anterior terminou com sete acoes abertas por excesso de compromisso.",
    ) as any;

    expect(envelope.reply).toContain("sete ações abertas por excesso de compromisso");
    expect(envelope.reply).toContain("três ações ligadas ao objetivo trimestral e duas para reduzir risco");
    expect(envelope.reply.match(/\?/g)).toHaveLength(1);
    expect(envelope.state_patch._adaptive).toMatchObject({ readiness: "partial", blocking_gap: "cinco ações prioritárias executáveis" });
    expect(envelope.proposal).toBeUndefined();
    expect(validateAdaptiveEnvelope({
      envelope,
      sessionType: "monthly",
      currentPhase: "abertura",
      phases: ["abertura", "relembrar", "resultados_do_mes", "acoes_chave", "capacidade", "sintese"],
      sessionState: {},
      previousOracleReply: "Qual resultado precisa mudar?",
      userMessage: message,
    })).toEqual([]);
  });
});
