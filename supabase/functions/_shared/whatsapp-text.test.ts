import { describe, expect, it } from "vitest";
import {
  extractWhatsAppPlainTextDocument,
  isWhatsAppPlainTextDocument,
} from "./whatsapp-text.ts";

describe("formatos textuais do WhatsApp", () => {
  it("aceita Markdown mesmo com MIME genérico da Evolution", () => {
    expect(isWhatsAppPlainTextDocument(
      "Relatorio_Contexto_Estrategico_GAAM_AIZE_1S2026_3.md",
      "application/octet-stream",
    )).toBe(true);
    expect(isWhatsAppPlainTextDocument("plano.markdown", "application/octet-stream"))
      .toBe(true);
    expect(extractWhatsAppPlainTextDocument(
      new TextEncoder().encode("# Relatório\r\n\r\n- Receita cresceu 12%\r\n- Margem estabilizada"),
      "Relatorio_Contexto_Estrategico_GAAM_AIZE_1S2026_3.md",
      "application/octet-stream",
    )).toBe("# Relatório\n\n- Receita cresceu 12%\n- Margem estabilizada");
  });

  it("mantém TXT e MIME textual sem liberar binário desconhecido", () => {
    expect(isWhatsAppPlainTextDocument("plano.txt", "application/octet-stream"))
      .toBe(true);
    expect(isWhatsAppPlainTextDocument("sem-extensao", "text/markdown"))
      .toBe(true);
    expect(isWhatsAppPlainTextDocument("arquivo.exe", "application/octet-stream"))
      .toBe(false);
  });
});
