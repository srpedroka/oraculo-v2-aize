import { describe, expect, it } from "vitest";
import { sessionAsideKind } from "./session-conversation.ts";

describe("session conversation aside", () => {
  it("preserves the session when the manager asks to share context in a file", () => {
    expect(sessionAsideKind("Antes de falar disso, posso compartilhar um arquivo com todo o contexto do semestre?"))
      .toBe("document_handoff");
    expect(sessionAsideKind("Quero enviar um PDF para você ler antes de continuar"))
      .toBe("document_handoff");
  });

  it("lets the model answer a challenge about the process without advancing the ritual", () => {
    expect(sessionAsideKind("Por que você está perguntando isso se estamos revisando o plano?"))
      .toBe("process_question");
    expect(sessionAsideKind("Quero elevar a margem para 12% até dezembro"))
      .toBeNull();
  });
});
