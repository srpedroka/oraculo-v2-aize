import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PlanDocument } from "../types";
import { PlanDocumentView } from "./PlanDocument";

describe("PlanDocumentView", () => {
  it("exibe os campos de qualidade do plano estrategico anual", () => {
    const document: PlanDocument = {
      id: "document-q1",
      orgId: "org-q1",
      areaId: null,
      sessionId: "session-q1",
      type: "strategic",
      origin: "session",
      period: "2026",
      title: "Plano Estrategico 2026",
      version: 1,
      createdBy: "owner-q1",
      createdAt: "2026-07-16T12:00:00.000Z",
      content: {
        empresa: "Empresa Q1",
        periodo: "2026",
        rastreabilidade: { schema_version: 1, origem: "proposta_confirmada", tipo_sessao: "strategic" },
        strategic: {
          temas: ["Crescer com previsibilidade"],
          renuncias: ["Nao abrir projetos paralelos"],
          riscos: ["Crescer sem margem"],
          decisoes_pendentes: ["Definir substituto para responsabilidades concentradas"],
          aprendizados_historicos: ["No ciclo anterior faltaram dono e rotina de decisao"],
        },
        objetivos: [
          {
            numero: 1,
            titulo: "Aumentar a previsibilidade da receita",
            atual: "55%",
            indicador: "Receita prevista realizada",
            meta: "80%",
            prazo: "2026-12-31",
            fonte: "CRM",
            estrategias: ["Revisar o funil semanalmente"],
          },
        ],
      },
    };

    render(<PlanDocumentView document={document} />);

    expect(screen.getByText("Renúncias:")).toBeInTheDocument();
    expect(screen.getByText("Nao abrir projetos paralelos")).toBeInTheDocument();
    expect(screen.getByText("Riscos:")).toBeInTheDocument();
    expect(screen.getByText("Decisões pendentes:")).toBeInTheDocument();
    expect(screen.getByText("Aprendizados anteriores:")).toBeInTheDocument();
    expect(screen.getByText(/Baseline: 55%/)).toBeInTheDocument();
    expect(screen.getByText(/Prazo: 2026-12-31/)).toBeInTheDocument();
    expect(screen.getByText("Fonte:")).toBeInTheDocument();
    expect(screen.getByText("CRM")).toBeInTheDocument();
    expect(screen.getByText("Revisar o funil semanalmente")).toBeInTheDocument();
    expect(screen.queryByText("Forças")).not.toBeInTheDocument();
    expect(screen.queryByText("Fraquezas")).not.toBeInTheDocument();
    expect(screen.getByText("Origem: Proposta confirmada")).toBeInTheDocument();
  });

  it("renderiza a revisão estratégica com antes, depois e justificativa", () => {
    const document: PlanDocument = {
      id: "document-review",
      orgId: "org-review",
      areaId: null,
      sessionId: "session-review",
      type: "strategic_review",
      origin: "session",
      period: "2027",
      title: "Revisão Estratégica 2027",
      version: 2,
      createdBy: "owner-review",
      createdAt: "2026-07-17T12:00:00.000Z",
      content: {
        empresa: "Empresa Q4E",
        tipo: "strategic_review",
        periodo: "2027",
        motivo_revisao: "Fechamento validou uma nova linha de base",
        rastreabilidade: { schema_version: 1, origem: "proposta_confirmada", tipo_sessao: "strategic_review" },
        ajustes: [{
          objetivo_id: "objective-review",
          titulo: "Aumentar previsibilidade",
          campo: "current",
          de: "52%",
          para: "45%",
          porque: "O relatório semanal consolidou o resultado",
        }],
      },
    };

    render(<PlanDocumentView document={document} />);

    expect(screen.getByText("Ajustes da Revisão")).toBeInTheDocument();
    expect(screen.getByText("Fechamento validou uma nova linha de base")).toBeInTheDocument();
    expect(screen.getByText(/current: 52% → 45%/)).toBeInTheDocument();
    expect(screen.getByText("O relatório semanal consolidou o resultado")).toBeInTheDocument();
    expect(screen.queryByText("Referência")).not.toBeInTheDocument();
  });
});
