import { describe, expect, it } from "vitest";
import { isTransientLocalEdgeRuntimeFailure } from "../../scripts/ci-transient-runtime";

describe("local Edge Runtime transient classifier", () => {
  it("reconhece somente o fechamento de socket observado no Supabase local", () => {
    expect(isTransientLocalEdgeRuntimeFailure("TypeError: fetch failed; UND_ERR_SOCKET; other side closed")).toBe(true);
    expect(isTransientLocalEdgeRuntimeFailure("AssertionError: expected 200 to be 400")).toBe(false);
    expect(isTransientLocalEdgeRuntimeFailure("UND_ERR_SOCKET: connection refused")).toBe(false);
  });
});
