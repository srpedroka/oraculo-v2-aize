import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  HISTORICAL_FILE_ACCEPT,
  importStrategicPlanFile,
  isHistoricalImageFile,
  PLAN_FILE_ACCEPT,
} from "./fileImport";

describe("importação local de arquivos", () => {
  it("normaliza TXT e preserva o nome", async () => {
    const file = new File([" Plano\r\n\r\n\r\n Meta 1 \u00a0"], "plano.txt", { type: "text/plain" });
    await expect(importStrategicPlanFile(file)).resolves.toEqual({
      fileName: "plano.txt",
      text: "Plano\n\nMeta 1",
      warning: undefined,
    });
  });

  it("recusa arquivo vazio e extensão não suportada", async () => {
    await expect(importStrategicPlanFile(new File([""], "vazio.txt"))).rejects.toThrow(/arquivo de texto está vazio/i);
    await expect(importStrategicPlanFile(new File(["x"], "plano.exe"))).rejects.toThrow(/Formato não suportado/);
  });

  it("lê Markdown como texto no app", async () => {
    const file = new File(
      ["# Contexto estratégico\r\n\r\n- Receita cresceu 12%\r\n- Margem estabilizada"],
      "Relatorio_1S2026.md",
      { type: "text/markdown" },
    );

    await expect(importStrategicPlanFile(file)).resolves.toEqual({
      fileName: "Relatorio_1S2026.md",
      text: "# Contexto estratégico\n\n- Receita cresceu 12%\n- Margem estabilizada",
      warning: undefined,
    });
    expect(PLAN_FILE_ACCEPT).toContain(".md");
    expect(PLAN_FILE_ACCEPT).toContain("text/markdown");
  });

  it("extrai slides PPTX na ordem numérica", async () => {
    const zip = new JSZip();
    zip.file("ppt/slides/slide10.xml", '<p:sld xmlns:p="p" xmlns:a="a"><a:t>Décimo</a:t></p:sld>');
    zip.file("ppt/slides/slide2.xml", '<p:sld xmlns:p="p" xmlns:a="a"><a:t>Segundo</a:t><a:t>Objetivo</a:t></p:sld>');
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const file = new File([buffer], "plano.pptx");
    const result = await importStrategicPlanFile(file);
    expect(result.text).toBe("Segundo\nObjetivo\n\nDécimo");
  });

  it("aceita imagens somente no fluxo histórico", () => {
    expect(HISTORICAL_FILE_ACCEPT).toContain(".webp");
    expect(isHistoricalImageFile(new File(["x"], "foto.PNG", { type: "image/png" }))).toBe(true);
    expect(isHistoricalImageFile(new File(["x"], "plano.txt", { type: "text/plain" }))).toBe(false);
  });
});
