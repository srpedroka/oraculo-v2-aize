import { describe, expect, it } from "vitest";
import { strategicReviewDocumentHandoff } from "./whatsapp-review-document.ts";

describe("documento recebido durante revisão estratégica", () => {
  it("entrega todo o Markdown ao condutor sem depender da classificação de bastidores", async () => {
    const report = [
      "# CONTEXTO ESTRATEGICO DO PRIMEIRO SEMESTRE",
      "Receita cresceu 12% e margem estabilizou.",
      "Linha de contexto detalhado. ".repeat(1_700),
      "FIM DO ARQUIVO: priorizar capacidade comercial no segundo semestre.",
    ].join("\n\n");
    const result = strategicReviewDocumentHandoff({
      sessionId: "review-session",
      fileName: "Relatorio_Contexto_Estrategico_1S2026.md",
      extractedText: report,
    });

    expect(result.resumeSessionId).toBe("review-session");
    expect(result.transientContext).toContain("Receita cresceu 12%");
    expect(result.transientContext).toContain("FIM DO ARQUIVO");
    expect(result.transientContext).not.toContain("Conteúdo truncado pelo servidor");
    expect(result.userText).not.toContain("Relatorio_Contexto_Estrategico");
    expect(result.userText).not.toContain("Receita cresceu 12%");
  });
});
