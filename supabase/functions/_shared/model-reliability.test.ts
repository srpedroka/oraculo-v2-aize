import { describe, expect, it, vi } from "vitest";
import {
  AiProviderError,
  createTransientAiRetryBudget,
  isRetryableAiProviderError,
  modelProviderHttpError,
  withTransientAiRetry,
} from "./model.ts";
import { classifyModelError } from "./model-probe.ts";
import { safeErrorCode } from "./structured-log.ts";

describe("AI provider reliability Q4G", () => {
  it("classifies only timeout, rate limit and provider unavailability as retryable", () => {
    const timeout = new AiProviderError("AI_PROVIDER_TIMEOUT", "timeout", { retryable: true });
    const rateLimit = modelProviderHttpError("xai", 429);
    const unavailable = modelProviderHttpError("xai", 503);
    const badRequest = modelProviderHttpError("xai", 400);

    expect([timeout, rateLimit, unavailable].every(isRetryableAiProviderError)).toBe(true);
    expect(isRetryableAiProviderError(badRequest)).toBe(false);
    expect(safeErrorCode(timeout)).toBe("AI_PROVIDER_TIMEOUT");
    expect(classifyModelError(timeout).status).toBe("timeout");
    expect(classifyModelError(rateLimit).status).toBe("rate_limited");
    expect(classifyModelError(badRequest)).toMatchObject({ status: "provider_error", httpStatus: 400 });
  });

  it("retries one transient failure and returns the successful result", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new AiProviderError("AI_PROVIDER_TIMEOUT", "timeout", { retryable: true }))
      .mockResolvedValueOnce("ok");

    await expect(withTransientAiRetry(operation)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry a validation or bad request failure", async () => {
    const failure = modelProviderHttpError("xai", 400);
    const operation = vi.fn().mockRejectedValue(failure);

    await expect(withTransientAiRetry(operation)).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("stops after the single retry when the provider remains unavailable", async () => {
    const operation = vi.fn().mockRejectedValue(modelProviderHttpError("xai", 503));

    await expect(withTransientAiRetry(operation)).rejects.toMatchObject({ code: "AI_PROVIDER_UNAVAILABLE" });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("shares the single retry across planning and adaptive repair calls", async () => {
    const budget = createTransientAiRetryBudget(1);
    const firstOperation = vi.fn()
      .mockRejectedValueOnce(modelProviderHttpError("xai", 503))
      .mockResolvedValueOnce("recovered");
    const repairOperation = vi.fn().mockRejectedValue(modelProviderHttpError("xai", 503));

    await expect(withTransientAiRetry(firstOperation, budget)).resolves.toBe("recovered");
    await expect(withTransientAiRetry(repairOperation, budget)).rejects.toMatchObject({ code: "AI_PROVIDER_UNAVAILABLE" });
    expect(firstOperation).toHaveBeenCalledTimes(2);
    expect(repairOperation).toHaveBeenCalledTimes(1);
    expect(budget.remaining).toBe(0);
  });
});
