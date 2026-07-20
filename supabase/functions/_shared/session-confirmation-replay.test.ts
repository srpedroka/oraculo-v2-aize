import { describe, expect, it } from "vitest";
import { replayedSessionConfirmation } from "./session-confirmation.ts";

describe("repetição da confirmação de proposta", () => {
  it("devolve o documento já gravado como o mesmo sucesso", () => {
    const session = {
      id: "session-1",
      org_id: "org-1",
      user_id: "user-1",
      pending_proposal: null,
      status: "completed",
    };
    const document = {
      id: "document-1",
      title: "Plano Estratégico 2026",
      version: 1,
    };
    const result = replayedSessionConfirmation(session, document);

    expect(result).toMatchObject({
      session,
      document,
      replayed: true,
    });
    expect(result?.reply).toContain("já foi gravada");
  });

  it("não fabrica sucesso sem documento confirmado", () => {
    expect(replayedSessionConfirmation({ id: "session-1" }, null)).toBeNull();
  });
});
