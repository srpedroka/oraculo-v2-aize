import { describe, expect, it, vi } from "vitest";
import { recoverableFeedback } from "./uiFeedback";

vi.mock("./frontendError", () => ({ reportFrontendError: vi.fn().mockResolvedValue(undefined) }));

describe("recoverableFeedback", () => {
  it("preserva mensagem humana curta", () => {
    const feedback = recoverableFeedback("Você não tem permissão para esta área.", "Falha ao iniciar.", "Nada foi salvo.");
    expect(feedback.title).toBe("Você não tem permissão para esta área.");
    expect(feedback.occurrenceId).toMatch(/^ORC-[A-Z0-9]{10}$/);
  });

  it("recolhe mensagem técnica atrás do texto seguro", () => {
    const feedback = recoverableFeedback(
      "POST /functions/v1/oracle-session status 500",
      "Não consegui iniciar esta condução.",
      "Nada foi salvo.",
    );
    expect(feedback.title).toBe("Não consegui iniciar esta condução.");
    expect(JSON.stringify(feedback)).not.toContain("/functions/");
  });
});

