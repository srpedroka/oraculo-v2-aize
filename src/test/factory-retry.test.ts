import { afterEach, describe, expect, it, vi } from "vitest";
import { retryTransport } from "../../tests/helpers/factory";
import { runStagingSql } from "../../tests/helpers/sql";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

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

  it("repete HTML transitório da API de administração do staging", async () => {
    process.env.SUPABASE_STAGING_URL = "https://staging-test.supabase.co";
    process.env.SUPABASE_STAGING_PROJECT_REF = "staging-test";
    process.env.SUPABASE_STAGING_ACCESS_TOKEN = "test-token";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("<html>proxy indisponível</html>", {
        status: 502,
        headers: { "content-type": "text/html" },
      }))
      .mockResolvedValueOnce(new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const result = runStagingSql("select 1");
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("não repete erro real de SQL da API de administração", async () => {
    process.env.SUPABASE_STAGING_URL = "https://staging-test.supabase.co";
    process.env.SUPABASE_STAGING_PROJECT_REF = "staging-test";
    process.env.SUPABASE_STAGING_ACCESS_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue(new Response("syntax error at or near select", {
      status: 400,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(runStagingSql("select invalid")).rejects.toThrow("syntax error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
