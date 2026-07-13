import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { HISTORICAL_FILE_ACCEPT, importStrategicPlanFile, isHistoricalImageFile } from "./fileImport";

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
    await expect(importStrategicPlanFile(new File([""], "vazio.txt"))).rejects.toThrow(/TXT está vazio/);
    await expect(importStrategicPlanFile(new File(["x"], "plano.exe"))).rejects.toThrow(/Formato não suportado/);
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
