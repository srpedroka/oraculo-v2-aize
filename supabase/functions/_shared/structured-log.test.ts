import { describe, expect, it, vi } from "vitest";
import { logStructured, safeErrorCode, withRequestLog } from "./structured-log.ts";

describe("structured logging", () => {
  it("redacts sensitive values and keeps the operational fields", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logStructured("info", {
      functionName: "whatsapp-worker",
      operation: "process",
      orgId: "org-1",
      status: "ok",
      correlationId: "corr-1",
      errorCode: null,
    });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('"functionName":"whatsapp-worker"'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('"status":"ok"'));
    spy.mockRestore();
  });

  it("logs one request outcome and preserves the request id", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const result = await withRequestLog(
      new Request("https://example.test", { headers: { "x-request-id": "req-123" } }),
      { functionName: "oracle-chat", operation: "chat", orgId: null, status: "ok" },
      async (id) => id,
    );
    expect(result).toBe("req-123");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('"requestId":"req-123"'));
    spy.mockRestore();
  });

  it("maps dependency failures to a stable code", () => {
    expect(safeErrorCode(new Error("fetch failed"))).toBe("DEPENDENCY_UNAVAILABLE");
    expect(safeErrorCode({ code: "pgrst116", message: "private database detail" })).toBe("PGRST116");
    expect(safeErrorCode({ code: "invalid code with spaces" })).toBe("INTERNAL_ERROR");
  });
});
