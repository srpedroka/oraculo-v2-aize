import { describe, expect, it, vi } from "vitest";
import { retryTransport } from "../../tests/helpers/factory";

describe("retry de transporte da fabrica E2E", () => {
  it("repete falha transitória e encerra no sucesso", async () => {
    const operation = vi.fn()
      .mockResolvedValueOnce({ error: { message: "TypeError: fetch failed" } })
      .mockResolvedValueOnce({ error: { message: "network error" } })
      .mockResolvedValueOnce({ error: null });

    await expect(retryTransport(operation)).resolves.toEqual({ error: null });
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("não mascara erro real de banco ou permissão", async () => {
    const result = { error: { message: "permission denied for table memberships" } };
    const operation = vi.fn().mockResolvedValue(result);

    await expect(retryTransport(operation)).resolves.toEqual(result);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
