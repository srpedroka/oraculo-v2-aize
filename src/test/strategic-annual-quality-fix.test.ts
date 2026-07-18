import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("strategic annual quality correction", () => {
  it("passes the canonical session period into annual proposal validation", () => {
    const engine = source("supabase/functions/_shared/session-engine.ts");
    const validationCall = engine.match(/validateAdaptiveEnvelope\(\{([\s\S]*?)\}\)/)?.[1] ?? "";
    expect(validationCall).toContain("sessionType: session.type");
    expect(validationCall).toContain("sessionPeriod: session.period");
  });

  it("uses one final confirmation and advances when an experienced manager supplies complete blocks", () => {
    const conductor = source("supabase/functions/_shared/conductors/strategic.ts");
    expect(conductor).toContain("Não interrompa para pedir confirmação intermediária");
    expect(conductor).toContain("A única confirmação de aprovação é a final");
    expect(conductor).toContain("Incorpore cada novo objetivo e avance");
    expect(conductor).toContain("Não saia da abertura enquanto existir memória relevante");
    expect(conductor).toContain("Não peça um quinto objetivo por padrão");
    expect(conductor).toContain("validar delegação ou retaguarda para a concentração de responsáveis");
    expect(conductor).toContain("Não promova inferência, hipótese ou silêncio a risco confirmado");
    expect(conductor).toContain("Nunca converta \"ciclo anterior\"");
    expect(conductor).toContain("sem apagar nem datar o sinal anterior");
    expect(conductor).not.toContain("confirme antes de ir ao próximo");
  });

  it("persists and renders the annual quality fields across database and canonical outputs", () => {
    const proposals = source("supabase/functions/_shared/proposals.ts");
    const documents = source("supabase/functions/_shared/plan-documents.ts");
    const webDocument = source("src/components/PlanDocument.tsx");
    const whatsapp = source("supabase/functions/_shared/plan-render.ts");
    const pdf = source("supabase/functions/_shared/plan-pdf.ts");

    expect(proposals).toContain("current: asText(objective.current ?? objective.baseline");
    expect(proposals).toContain("evidence_plan: asText(objective.source");
    expect(proposals).toContain("deliverables: asTextArray(objective.strategies");
    expect(proposals).toContain("pendingDecisions: asTextArray(proposal.pendingDecisions");
    expect(documents).toContain("aprendizados_historicos");
    expect(documents).toContain("decisoes_pendentes");
    expect(documents).toContain("estrategias: firstFilledArray<string>");
    for (const renderer of [webDocument, whatsapp, pdf]) {
      expect(renderer).toContain("Baseline:");
    }
    expect(webDocument).toContain("Aprendizados anteriores");
    expect(whatsapp).toContain("Aprendizados anteriores");
    expect(pdf).toContain("Renúncias");
  });

  it("makes the Q1 deterministic gate require the corrected fields", () => {
    const evaluationCase = JSON.parse(source("tests/evals/strategic-quality/cases/q1-minimal-annual.json"));
    expect(evaluationCase.expected).toMatchObject({
      requiresBaseline: true,
      requiresDeadline: true,
      requiresStrategies: true,
      requiresRisks: true,
      requiresRenunciations: true,
      requiresHistoricalLessons: true,
      requiresPendingDecisions: true,
    });
  });
});
