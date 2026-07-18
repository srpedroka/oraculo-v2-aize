import { AiProviderError } from "./model.ts";

export const PLANNING_REQUEST_DEADLINE_MS = 90_000;
export const PLANNING_MODEL_ATTEMPT_TIMEOUT_MS = 40_000;
export const PLANNING_REPLY_RESERVE_MS = 4_000;
export const PLANNING_MIN_ATTEMPT_MS = 5_000;

export function planningModelTimeout(deadlineAt: number, now = Date.now()) {
  const availableMs = deadlineAt - now - PLANNING_REPLY_RESERVE_MS;
  if (availableMs < PLANNING_MIN_ATTEMPT_MS) {
    throw new AiProviderError(
      "AI_PROVIDER_TIMEOUT",
      "A condução excedeu o tempo seguro desta resposta. Nenhum plano foi alterado; tente novamente.",
    );
  }
  return Math.min(PLANNING_MODEL_ATTEMPT_TIMEOUT_MS, availableMs);
}
