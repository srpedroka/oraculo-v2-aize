import { describe, it, expect } from "vitest";
import { isOverdue, daysLate, derivedStatus, summarize, groupByOwner, type TrackItem } from "./execution";

const NOW = new Date("2026-07-12T12:00:00");

function item(partial: Partial<TrackItem>): TrackItem {
  return { id: "x", kind: "objective", title: "t", owner: "", areaId: null, deadline: null, status: "on_track", ...partial };
}

describe("isOverdue", () => {
  it("marca atrasado quando o prazo (ISO) já passou e não está concluído", () => {
    expect(isOverdue({ deadline: "2026-01-01", status: "on_track" }, NOW)).toBe(true);
  });
  it("nunca marca atrasado quando está concluído", () => {
    expect(isOverdue({ deadline: "2026-01-01", status: "done" }, NOW)).toBe(false);
  });
  it("não marca atrasado para prazo futuro", () => {
    expect(isOverdue({ deadline: "2027-01-01", status: "on_track" }, NOW)).toBe(false);
  });
  it("ignora prazos não-parseáveis (ex.: 'contínuo')", () => {
    expect(isOverdue({ deadline: "contínuo", status: "on_track" }, NOW)).toBe(false);
    expect(isOverdue({ deadline: null, status: "on_track" }, NOW)).toBe(false);
  });
});

describe("daysLate", () => {
  it("conta os dias corridos de atraso", () => {
    expect(daysLate("2026-07-02", NOW)).toBe(10);
  });
  it("retorna 0 quando ainda não venceu e null quando não parseia", () => {
    expect(daysLate("2027-01-01", NOW)).toBe(0);
    expect(daysLate("contínuo", NOW)).toBeNull();
  });
});

describe("derivedStatus", () => {
  it("prioriza done, depois late derivado, depois o status salvo", () => {
    expect(derivedStatus({ deadline: "2026-01-01", status: "done" }, NOW)).toBe("done");
    expect(derivedStatus({ deadline: "2026-01-01", status: "on_track" }, NOW)).toBe("late");
    expect(derivedStatus({ deadline: "2027-01-01", status: "at_risk" }, NOW)).toBe("at_risk");
    expect(derivedStatus({ deadline: "2027-01-01", status: "on_track" }, NOW)).toBe("on_track");
  });
});

describe("summarize", () => {
  it("agrega no prazo, atrasados, em risco e concluídos", () => {
    const items = [
      item({ deadline: "2026-01-01", status: "on_track" }), // atrasado derivado
      item({ deadline: "2027-01-01", status: "on_track" }), // no prazo
      item({ deadline: "2027-01-01", status: "at_risk" }), // em risco
      item({ deadline: "2026-01-01", status: "done" }), // concluído
    ];
    const s = summarize(items, NOW);
    expect(s.total).toBe(4);
    expect(s.withDeadline).toBe(4);
    expect(s.late).toBe(1);
    expect(s.atRisk).toBe(1);
    expect(s.done).toBe(1);
    expect(s.onTrack).toBe(1);
    expect(s.onTimePct).toBeCloseTo(0.75, 5);
  });
  it("onTimePct é null quando não há prazos", () => {
    expect(summarize([item({ deadline: null })], NOW).onTimePct).toBeNull();
  });
});

describe("groupByOwner", () => {
  it("agrupa por responsável e ordena por atrasados", () => {
    const items = [
      item({ owner: "Ana", deadline: "2026-01-01", status: "on_track" }),
      item({ owner: "Ana", deadline: "2027-01-01", status: "on_track" }),
      item({ owner: "", deadline: "2027-01-01", status: "on_track" }),
    ];
    const groups = groupByOwner(items, NOW);
    expect(groups[0].owner).toBe("Ana");
    expect(groups[0].total).toBe(2);
    expect(groups[0].late).toBe(1);
    expect(groups.find((g) => g.owner === "Sem responsável")).toBeTruthy();
  });
});
