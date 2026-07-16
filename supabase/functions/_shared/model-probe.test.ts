import { afterEach, describe, expect, it, vi } from "vitest";
import { probeModel } from "./model-probe.ts";

describe("model probe failure handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("classifica indisponibilidade do provedor sem expor a chave", async () => {
    const apiKey = "fake-master-provider-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      `upstream unavailable; credential=${apiKey}`,
      { status: 503 },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const result = await probeModel("openai", "test-model", apiKey);

    expect(result).toMatchObject({ status: "provider_error", httpStatus: 503 });
    expect(result.detail).toContain("[redacted]");
    expect(result.detail).not.toContain(apiKey);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("classifica timeout controlado sem chamar um provedor real", async () => {
    const timeout = new Error("request aborted");
    timeout.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));

    await expect(probeModel("xai", "test-model", "fake-master-key")).resolves.toEqual({
      status: "timeout",
      detail: "Tempo limite ao validar o modelo.",
    });
  });
});
