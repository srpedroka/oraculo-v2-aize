import { describe, expect, it } from "vitest";
import {
  explicitlyReferencesQuickTarget,
  hasConcreteQuickUpdateSignal,
  isConcreteEvidenceText,
  isNonMutatingAcknowledgement,
} from "./quick-update-policy.ts";

describe("política de atualizações rápidas", () => {
  it.each(["ok", "Sim", "PILOTO OK", "teste funcionando", "recebido.", "tudo certo"])(
    "trata %s como confirmação sem mutação",
    (message) => {
      expect(isNonMutatingAcknowledgement(message)).toBe(true);
      expect(hasConcreteQuickUpdateSignal(message)).toBe(false);
    },
  );

  it.each([
    "Concluí a revisão da tabela de preços",
    "Avançamos para 65% no objetivo comercial",
    "65% atingido",
    "Evidência: contrato assinado hoje",
    "Entregamos os dois protótipos previstos",
  ])("reconhece atualização concreta em %s", (message) => {
    expect(hasConcreteQuickUpdateSignal(message)).toBe(true);
  });

  it("recusa evidência genérica e aceita fato concreto", () => {
    expect(isConcreteEvidenceText("Piloto ok")).toBe(false);
    expect(isConcreteEvidenceText("feito")).toBe(false);
    expect(isConcreteEvidenceText("Contrato assinado hoje")).toBe(true);
    expect(isConcreteEvidenceText("Atingimos 92% da meta")).toBe(true);
  });

  it("exige referência lexical suficiente ao alvo", () => {
    expect(explicitlyReferencesQuickTarget(
      "Concluí a revisão da tabela de preços",
      "Revisar tabela de preços",
      "Aumentar margem comercial",
    )).toBe(true);
    expect(explicitlyReferencesQuickTarget(
      "Concluí a implantação do ritual",
      "Desenvolver líderes-chave",
      "Formalizar rituais e reduzir dependência dos sócios",
    )).toBe(false);
  });
});
