import { describe, expect, it } from "vitest";
import { isConfirmationMessage } from "./confirmation-policy.ts";

describe("confirmação de proposta", () => {
  it.each(["confirma", "Confirmado", "pode gravar", "já está conferido pode gravar"])("aceita %s", (message) => {
    expect(isConfirmationMessage(message)).toBe(true);
  });

  it.each(["sim objetivo principal", "confirmar a evidência depois", "planejar o calendário"])("não aceita %s", (message) => {
    expect(isConfirmationMessage(message)).toBe(false);
  });
});
