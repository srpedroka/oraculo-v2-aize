import { describe, it, expect } from "vitest";
import { attainment, ytd, sumDeltas, runRateProjection, onPace, closedMonths } from "./kpi";
import type { KpiMonthlyValue } from "../types";

function mv(actual: number | null, target: number | null = null): KpiMonthlyValue {
  return { actualValue: actual, targetValue: target } as unknown as KpiMonthlyValue;
}

describe("attainment", () => {
  it("higher_better é atingido/meta; lower_better é meta/atingido", () => {
    expect(attainment(80, 100, "higher_better")).toBeCloseTo(0.8, 5);
    expect(attainment(100, 80, "lower_better")).toBeCloseTo(0.8, 5);
  });
  it("protege contra meta zero ou nula", () => {
    expect(attainment(50, 0, "higher_better")).toBeNull();
    expect(attainment(50, null, "higher_better")).toBeNull();
    expect(attainment(null, 100, "higher_better")).toBeNull();
  });
});

describe("ytd", () => {
  const months = [mv(10), mv(20), null, mv(40)];
  it("soma os meses fechados até o mês-foco", () => {
    expect(ytd(months, 3, "sum")).toBe(30);
    expect(ytd(months, 4, "sum")).toBe(70);
  });
  it("faz média quando o modo é average (margem %)", () => {
    expect(ytd(months, 3, "average")).toBe(15);
  });
  it("é null quando não há nenhum mês fechado", () => {
    expect(ytd([null, null], 2, "sum")).toBeNull();
  });
});

describe("closedMonths", () => {
  it("conta os meses com valor realizado", () => {
    expect(closedMonths([mv(10), null, mv(5)], 3)).toBe(2);
  });
});

describe("sumDeltas", () => {
  it("soma as gerações mensais ignorando nulos", () => {
    expect(sumDeltas([5, null, 3], 3)).toBe(8);
    expect(sumDeltas([null, null], 2)).toBeNull();
  });
});

describe("runRateProjection", () => {
  it("projeta o ano pelo ritmo dos meses fechados", () => {
    expect(runRateProjection(30, 3)).toBe(120);
  });
  it("é null sem base", () => {
    expect(runRateProjection(null, 3)).toBeNull();
    expect(runRateProjection(30, 0)).toBeNull();
  });
});

describe("onPace", () => {
  it("aprova quando a projeção fica dentro da tolerância da meta", () => {
    expect(onPace(120, 100, "higher_better")).toBe(true);
    expect(onPace(80, 100, "higher_better")).toBe(false);
    expect(onPace(100, 120, "lower_better")).toBe(true);
  });
  it("é null sem projeção ou meta", () => {
    expect(onPace(null, 100, "higher_better")).toBeNull();
    expect(onPace(120, null, "higher_better")).toBeNull();
  });
});
