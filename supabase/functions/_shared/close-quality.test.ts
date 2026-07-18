import { describe, expect, it } from "vitest";
import { monthClosePartialDecisionEnvelope, normalizeCloseQualityEnvelope } from "./close-quality.ts";
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
});
