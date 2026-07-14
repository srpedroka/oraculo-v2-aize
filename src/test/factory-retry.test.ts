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

  it("repete quando o fetch lança antes de formar uma resposta", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({ error: null });

    await expect(retryTransport(operation)).resolves.toEqual({ error: null });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("não repete exceção que não seja de transporte", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("permission denied for table profiles"));

    await expect(retryTransport(operation)).rejects.toThrow("permission denied for table profiles");
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
