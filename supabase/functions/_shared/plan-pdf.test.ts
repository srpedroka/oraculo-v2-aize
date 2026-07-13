import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { planDocumentFileName, renderPlanDocumentPdf } from "./plan-pdf.ts";

const fixture = {
  title: "Plano Trimestral Comercial T3 2026",
  period: "T3 2026",
  version: 1,
  content: {
    empresa: "Gaam/Aize",
    area: "Comercial",
    tipo: "quarterly",
    periodo: "T3 2026",
    contexto_rapido: [
      "Ter indicadores claros de ticket médio, novos produtos e base de clientes ativos, além de implantar o sistema de vendas.",
    ],
    referencia: {
      objetivo_anual: "Reorganizar a área comercial com estrutura, rotinas, scripts e materiais de apoio em 2026",
      objetivos_trimestre: ["Implantar o novo sistema de vendas"],
    },
    objetivos: [{
      numero: 1,
      titulo: "Implantar o novo sistema de vendas para apoiar a reorganização da área comercial",
      tipo: "evolucao",
      indicador: "Adoção do sistema pelos vendedores e integração da base ao ERP",
      meta: "Sistema disponível para pelo menos 80% dos vendedores até o fim de setembro.",
      responsavel: "Diego",
      resultado: "Novo sistema implantado e em uso pela equipe Comercial.",
      vinculo: "Reorganizar a área comercial em 2026",
      entregas: ["Plano de migração pronto e calendário para os próximos 60 dias."],
      acoes: [{
        codigo: "1.1",
        descricao: "Planejar o calendário de migração e instalação do sistema",
        criterio: "Plano pronto e com calendário para os próximos 60 dias",
        prazo: "30 dias",
        responsavel: "Diego",
      }],
      evidencia: "Usuários ativos, base migrada e integração com ERP comprovados.",
    }],
    foco_aprendizado: ["Consolidar indicadores comerciais confiáveis."],
    frase_de_foco: "Um sistema adotado pela equipe transforma dados comerciais em decisões melhores.",
  },
};

describe("PDF canônico do plano", () => {
  it("gera A4 válido, com metadados e nome sem período duplicado", async () => {
    const result = await renderPlanDocumentPdf(fixture);
    const parsed = await PDFDocument.load(result.bytes);

    expect(result.bytes.slice(0, 4)).toEqual(new Uint8Array([37, 80, 68, 70]));
    expect(result.fileName).toBe("plano-trimestral-comercial-t3-2026.pdf");
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(parsed.getTitle()).toBe(fixture.title);

    if (process.env.WRITE_PDF_FIXTURE === "1") {
      const outputDir = resolve("tmp/pdfs");
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(resolve(outputDir, "quarterly-plan-designed.pdf"), result.bytes);
    }
  });

  it("não repete o ano no nome de plano estratégico", () => {
    expect(planDocumentFileName({ title: "Plano Estratégico 2026", period: "2026" })).toBe("plano-estrategico-2026.pdf");
  });
});
