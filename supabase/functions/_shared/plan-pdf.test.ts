import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { planDocumentFileName, renderPlanDocumentPdf } from "./plan-pdf.ts";

async function extractText(bytes: Uint8Array) {
  const standardFontDataUrl = `${resolve("node_modules/pdfjs-dist/standard_fonts")}/`;
  const pdf = await getDocument({ data: new Uint8Array(bytes), standardFontDataUrl }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
  }
  return pages.join(" ");
}

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

  it("preserva prazo, origem e fechamento completo no texto do PDF", async () => {
    const result = await renderPlanDocumentPdf({
      title: "Fechamento Mensal Comercial Jun 2027",
      period: "Jun 2027",
      version: 2,
      origin: "session",
      content: {
        empresa: "Empresa Q4E",
        area: "Comercial",
        tipo: "month_close",
        periodo: "Jun 2027",
        rastreabilidade: { origem: "proposta_confirmada" },
        objetivos: [{ numero: 1, titulo: "Elevar adoção", prazo: "2027-06-30", decisao: "Rolar saldo" }],
        fechamento: {
          resumo: "Objetivo parcialmente atingido",
          percentual: 70,
          aprendizados: ["Treinar por equipe"],
          pendencias: ["Concluir migração"],
          decisoes: ["Rolar saldo"],
          proximo_periodo: "Jul 2027",
        },
      },
    });
    const text = (await extractText(result.bytes)).replace(/\s+/g, " ");

    for (const expected of [
      "Versão 2", "Origem: Proposta confirmada", "Prazo: 2027-06-30", "Decisão: Rolar saldo",
      "Aprendizados: Treinar por equipe", "Pendências: Concluir migração", "Próximo período: Jul 2027",
    ]) expect(text).toContain(expected);
  });

  it("leva a revisão semestral completa dos Documentos para o PDF do WhatsApp", async () => {
    const result = await renderPlanDocumentPdf({
      title: "Revisão Semestral e Plano do Segundo Semestre 2026",
      period: "2026",
      version: 1,
      origin: "session",
      content: {
        empresa: "Gaam/Aize",
        area: "Empresa",
        tipo: "strategic_review",
        periodo: "2026",
        motivo_revisao: "Revisar o plano com as evidências do primeiro semestre.",
        plano_anual_original_preservado: true,
        revisao_semestre: {
          resumo_executivo: "O grupo avançou em receita, mas margem e produtividade exigem decisões no segundo semestre.",
          avancos_confirmados: ["AIZE ganhou tração comercial", "Receita do grupo cresceu"],
          lacunas: ["Margem pressionada", "Paradas reduziram produtividade"],
          padroes_repetidos: ["Metas sem evidência formal"],
          aprendizados: ["Poucas prioridades melhoram a execução"],
          riscos: ["Aumento de custo fixo sem ganho de produtividade"],
          lacunas_evidencia: ["Indicadores fabris incompletos"],
          resultados_por_area: [{
            area: "Industrial",
            avancos: ["Novo fluxo de produção iniciado"],
            lacunas: ["Paradas ainda recorrentes"],
            evidencias: ["Relatórios de janeiro a junho"],
          }],
        },
        plano_segundo_semestre: {
          foco: "Consolidar resultado com três prioridades executáveis.",
          decisoes: ["Priorizar produtividade", "Sustentar faturamento"],
          renuncias: ["Não ampliar custo fixo"],
          riscos: ["Adoção lenta dos novos rituais"],
          cadencia: ["Revisão mensal dos indicadores"],
          prioridades: [{
            titulo: "Evolução da fábrica",
            justificativa: "Recuperar produtividade sem aumentar a estrutura.",
            resultado_esperado: "Ganho de 20% no ano.",
            indicador: "Produtividade industrial",
            meta: "20%",
            responsavel: "Marcelo",
            prazo: "2026-12-31",
            primeira_acao: "Validar o baseline do primeiro semestre.",
          }],
        },
        ajustes: [],
      },
    });
    const parsed = await PDFDocument.load(result.bytes);
    const text = (await extractText(result.bytes)).replace(/\s+/g, " ");

    if (process.env.WRITE_PDF_FIXTURE === "1") {
      const outputDir = resolve("tmp/pdfs");
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(resolve(outputDir, "strategic-review-designed.pdf"), result.bytes);
    }

    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(result.bytes.byteLength).toBeGreaterThan(3_000);
    for (const expected of [
      "Leitura executiva: O grupo avançou em receita",
      "RESULTADOS POR ÁREA",
      "Industrial",
      "PLANO DO SEGUNDO SEMESTRE",
      "Prioridade 1: Evolução da fábrica",
      "Responsável e prazo: Marcelo",
      "O Plano Estratégico Anual original foi preservado.",
    ]) expect(text).toContain(expected);
  });
});
