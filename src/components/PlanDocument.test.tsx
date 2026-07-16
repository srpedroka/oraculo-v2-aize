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
    expect(screen.getByText("Fonte:")).toBeInTheDocument();
    expect(screen.getByText("CRM")).toBeInTheDocument();
    expect(screen.getByText("Revisar o funil semanalmente")).toBeInTheDocument();
    expect(screen.queryByText("Forças")).not.toBeInTheDocument();
    expect(screen.queryByText("Fraquezas")).not.toBeInTheDocument();
  });
});
