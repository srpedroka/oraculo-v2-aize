import { describe, expect, it, vi } from "vitest";
import { AiControlLimitError, evaluateAiControls } from "./ai-controls";

describe("controles de IA", () => {
  it("mantém a chamada liberada no modo monitor", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { allowed: true, mode: "monitor", reason: "org_rate", orgCount: 61, orgLimit: 60 },
      error: null,
    });
    const result = await evaluateAiControls({ rpc }, "org-1", { userId: "user-1" });
    expect(result?.allowed).toBe(true);
    expect(rpc).toHaveBeenCalledWith("evaluate_ai_call_controls", {
      p_org_id: "org-1",
      p_user_id: "user-1",
      p_allow_completion: false,
    });
  });

  it("falha aberta se a telemetria estiver indisponível", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await evaluateAiControls({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "offline" } }) }, "org-1");
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("interrompe somente quando o servidor devolve allowed=false", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { allowed: false, mode: "block", reason: "monthly_budget" },
      error: null,
    });
    await expect(evaluateAiControls({ rpc }, "org-1")).rejects.toBeInstanceOf(AiControlLimitError);
  });
});

