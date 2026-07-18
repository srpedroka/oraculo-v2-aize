import { describe, expect, it } from "vitest";
import {
  PLANNING_MODEL_ATTEMPT_TIMEOUT_MS,
  PLANNING_REPLY_RESERVE_MS,
  PLANNING_REQUEST_DEADLINE_MS,
  planningModelTimeout,
} from "./planning-timeout.ts";

describe("planning provider timeout budget Q4R", () => {
  it("reserves two full model attempts inside the request deadline", () => {
    expect(PLANNING_REQUEST_DEADLINE_MS).toBeGreaterThanOrEqual(
      (PLANNING_MODEL_ATTEMPT_TIMEOUT_MS * 2) + PLANNING_REPLY_RESERVE_MS,
    );
    const deadline = PLANNING_REQUEST_DEADLINE_MS;
    expect(planningModelTimeout(deadline, 0)).toBe(40_000);
    expect(planningModelTimeout(deadline, 44_000)).toBe(40_000);
  });

  it("fails closed when there is no safe time left for another attempt", () => {
    expect(() => planningModelTimeout(90_000, 82_000)).toThrow(/Nenhum plano foi alterado/);
  });
});
