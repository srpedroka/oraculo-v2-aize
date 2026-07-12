import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readKpiSpreadsheet } from "./kpiSpreadsheet";

async function fixtureFile(fileName: string, type: string) {
  const contents = await readFile(resolve(process.cwd(), "tests/fixtures/kpi-import", fileName));
  return new File([contents], fileName, { type });
}

function expectKpiRows(rawText: string) {
  expect(rawText).toContain("Aba: Indicadores");
  expect(rawText).toContain("Mês\tMeta Faturamento\tAtingido Faturamento");
  expect(rawText).toContain("Jan 2026\t1000000\t975500");
  expect(rawText).toContain("Fev 2026\t1100000\t1120250");
}

describe("readKpiSpreadsheet", () => {
  it("le uma planilha XLSX real", async () => {
    const result = await readKpiSpreadsheet(await fixtureFile(
      "indicadores.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ));

    expect(result.truncated).toBe(false);
    expectKpiRows(result.rawText);
  });

  it("preserva a importacao de XLS legado", async () => {
    const result = await readKpiSpreadsheet(await fixtureFile("indicadores.xls", "application/vnd.ms-excel"));

    expectKpiRows(result.rawText);
  });

  it("preserva a importacao de CSV", async () => {
    const result = await readKpiSpreadsheet(await fixtureFile("indicadores.csv", "text/csv"));

    expect(result.rawText).toContain("Mes\tMeta Faturamento\tAtingido Faturamento");
    expect(result.rawText).toContain("Jan 2026\t1000000\t975500");
  });

  it("recusa planilha vazia", async () => {
    await expect(readKpiSpreadsheet(new File([], "vazia.xlsx"))).rejects.toThrow("A planilha está vazia.");
  });

  it("recusa XLSX corrompido ou apenas renomeado", async () => {
    await expect(readKpiSpreadsheet(await fixtureFile("corrompido.xlsx", "application/octet-stream")))
      .rejects.toThrow("Não foi possível ler esta planilha");
  });

  it("recusa extensao fora da lista permitida", async () => {
    await expect(readKpiSpreadsheet(new File(["dados"], "indicadores.json")))
      .rejects.toThrow("Envie uma planilha .xlsx, .xls ou .csv.");
  });
});
