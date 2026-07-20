import { describe, expect, it } from "vitest";
import { formatObjectiveTarget } from "./format";

describe("formatObjectiveTarget", () => {
  it("remove o rótulo Meta já presente no dado", () => {
    expect(formatObjectiveTarget("Meta: Semanal")).toBe("Semanal");
    expect(formatObjectiveTarget(" meta : 80% ")).toBe("80%");
  });

  it("mantém o fallback quando a meta está vazia", () => {
    expect(formatObjectiveTarget(null)).toBe("A definir");
    expect(formatObjectiveTarget("Meta: ")).toBe("A definir");
  });
});
