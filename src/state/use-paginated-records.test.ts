import { describe, expect, it } from "vitest";
import { buildCreatedAtCursorFilter } from "./use-paginated-records";

describe("paginação por cursor", () => {
  it("desempata timestamps iguais pelo id sem repetir a última linha", () => {
    expect(buildCreatedAtCursorFilter({
      createdAt: "2026-07-13T18:30:00.000Z",
      id: "11111111-1111-4111-8111-111111111111",
    })).toBe(
      "created_at.lt.2026-07-13T18:30:00.000Z,and(created_at.eq.2026-07-13T18:30:00.000Z,id.lt.11111111-1111-4111-8111-111111111111)",
    );
  });
});
