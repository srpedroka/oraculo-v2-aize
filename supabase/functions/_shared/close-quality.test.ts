import { describe, expect, it } from "vitest";
import { monthClosePartialDecisionEnvelope, normalizeCloseQualityEnvelope, quarterCloseOpenDecisionEnvelope } from "./close-quality.ts";
import { validateAdaptiveEnvelope } from "./session-adaptive.ts";

describe("close quality Q4W", () => {
  it("asks only for the deadline after absorbing verdict, pending action and learning", () => {
    const message = [
      "Duas das tres acoes foram concluidas.",
      "A terceira depende do fornecedor e deve ser renegociada, nao marcada como concluida.",
      "O aprendizado e envolver o fornecedor no inicio do proximo ciclo.",
      "A confianca para o proximo mes e amarela.",
    ].join("\n");
    const envelope = monthClosePartialDecisionEnvelope(
      { type: "month_close" },
      message,
      "user: Fechamos o mes em cinquenta por cento, abaixo da meta de sessenta, mas partimos de quarenta.",
    ) as any;

    expect(envelope.reply).toContain("50%");
    expect(envelope.reply).toContain("meta de 60%");
    expect(envelope.reply).toContain("integração segue aberta");
    expect(envelope.reply).toContain("Qual novo prazo");
    expect(envelope.reply.match(/\?/g)).toHaveLength(1);
    expect(validateAdaptiveEnvelope({
      envelope,
      sessionType: "month_close",
      currentPhase: "abertura",
      phases: ["abertura", "revisao", "pendencias", "pulso", "resumo", "ponte"],
      sessionState: {},
      previousOracleReply: "Qual aprendizado ficou?",
      userMessage: message,
    })).toEqual([]);
  });

  it("preserves achieved, target, learning and next period in the close proposal", () => {
    const normalized = normalizeCloseQualityEnvelope({
      envelope: {
        proposal: {
          type: "month_close",
          period: "Jun 2027",
          nextPeriod: "",
          reviews: [{ title: "Qualidade do funil", progressFinal: 50, learning: "Envolver o fornecedor no início" }],
        },
      },
      sessionType: "month_close",
      period: "Jun 2027",
      conversationText: "Resultado 50% contra meta 60%: status parcial.",
    }) as any;

    expect(normalized.proposal.reviews[0]).toMatchObject({ current: "50%", target: "60%", result: "Atingido 50% contra meta 60%" });
    expect(normalized.proposal.learnings).toEqual(["Envolver o fornecedor no início"]);
    expect(normalized.proposal.nextPeriod).toBe("Jul 2027");
  });

  it("uses quarterly memory, alignment and asks only for scope and deadline", () => {
    const message = [
      "A adocao ficou dois pontos abaixo e o resultado deve ser parcial.",
      "A integracao ainda contribui para o mesmo objetivo anual.",
      "O gestor decide rolar somente a integracao para o proximo trimestre com escopo reduzido.",
      "A causa foi dependencia externa subestimada.",
    ].join("\n");
    const conversation = [
      "user: O trimestre terminou com setenta e oito por cento de adocao contra meta de oitenta.",
      `user: ${message}\nContexto superior: Objetivo anual: aumentar previsibilidade comercial com adocao consistente do processo.`,
    ].join("\n");
    const envelope = quarterCloseOpenDecisionEnvelope(
      { type: "quarter_close" },
      message,
      conversation,
      "Check-ins do trimestre registram dependencia externa desde o segundo mes.",
    ) as any;

    expect(envelope.reply).toContain("78%");
    expect(envelope.reply).toContain("meta de 80%");
    expect(envelope.reply).toContain("desde o segundo mês");
    expect(envelope.reply).toContain("objetivo anual de aumentar previsibilidade comercial");
    expect(envelope.reply).toContain("escopo reduzido e o prazo");
    expect(envelope.reply.match(/\?/g)).toHaveLength(1);
  });

  it("enriches the quarterly close proposal and builds a complete final summary", () => {
    const objectiveId = "00000000-0000-0000-0000-000000000111";
    const actionId = "00000000-0000-0000-0000-000000000222";
    const conversation = "Resultado 78% contra meta 80%. Rolar somente a acao Concluir integracao externa para T3. Contexto superior: Objetivo anual: aumentar previsibilidade comercial com adocao consistente do processo.";
    const normalized = normalizeCloseQualityEnvelope({
      envelope: {
        reply: "Confirma?",
        proposal: {
          type: "quarter_close",
          reviews: [{
            objectiveId,
            title: "Elevar adoção",
            decision: "roll",
            reason: "dependência externa subestimada",
            newScope: "integração principal",
            newDeadline: "2027-07-31",
            learning: "validar dependência no início",
          }],
        },
      },
      sessionType: "quarter_close",
      period: "T2 2027",
      conversationText: conversation,
      contextText: [
        `- [Em risco] Elevar adoção (id: ${objectiveId}; Trimestral; Resultado; indicador: Adoção; meta: 80%; atual: 78%; prazo: 2027-06-30; dono: PERSON_FIXTURE_MANAGER; progresso: 78%)`,
        `    - [Atrasado] Concluir integracao externa (id: ${actionId}; dono: PERSON_FIXTURE_MANAGER; prazo: 2027-06-30; critério: Integração validada)`,
      ].join("\n"),
    }) as any;

    expect(normalized.proposal.reviews[0]).toMatchObject({
      current: "78%",
      target: "80%",
      metric: "Adoção",
      owner: "PERSON_FIXTURE_MANAGER",
      deadline: "2027-06-30",
    });
    expect(normalized.proposal.annualAlignment).toMatchObject({
      status: "linked",
      strategicObjectiveTitle: "aumentar previsibilidade comercial com adocao consistente do processo",
    });
    expect(normalized.proposal.nextPeriod).toBe("T3 2027");
    expect(normalized.proposal.pendencies[0]).toMatchObject({
      kind: "action",
      objectiveId,
      actionId,
      decision: "roll",
      newScope: "integração principal",
      newDeadline: "2027-07-31",
    });
    expect(normalized.reply).toContain("78% contra meta de 80%");
    expect(normalized.reply).toContain("rolar somente integração principal para 2027-07-31");
    expect(normalized.reply).toContain("objetivo anual aumentar previsibilidade comercial");
    expect(normalized.reply.match(/\?/g)).toHaveLength(1);
  });
});
