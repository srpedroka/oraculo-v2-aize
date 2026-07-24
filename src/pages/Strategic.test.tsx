import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialState } from "../data/seed";
import type { AppAction, AppContextValue } from "../state/store-contract";
import type { PlanDocument } from "../types";

const storeMock = vi.hoisted(() => ({ value: null as AppContextValue | null }));

vi.mock("../state/store", () => ({
  useAppState: () => storeMock.value as AppContextValue,
}));

import { Strategic } from "./Strategic";

function planDocument(
  id: string,
  type: PlanDocument["type"],
  version: number,
  content: Record<string, unknown> = {},
): PlanDocument {
  return {
    id,
    orgId: "org-gaam",
    areaId: null,
    sessionId: null,
    type,
    origin: "session",
    period: "2026",
    title: type === "strategic" ? "Plano Estratégico 2026" : "Revisão Semestral 2026",
    content,
    version,
    createdBy: "owner-1",
    createdAt: type === "strategic" ? "2026-01-05T10:00:00Z" : "2026-07-23T10:00:00Z",
  };
}

describe("Strategic", () => {
  afterEach(() => {
    cleanup();
    storeMock.value = null;
  });

  it("mostra a revisão pendente e inicia sua aplicação no plano anual", () => {
    const actions: AppAction[] = [];
    const dispatch = vi.fn((action: AppAction) => actions.push(action));
    const review = planDocument("review-2026", "strategic_review", 1, {
      ciclo_revisao: "midyear",
      plano_anual_original_preservado: true,
      atualizacao_plano_anual: { modo: "preserve" },
    });
    storeMock.value = {
      state: {
        ...initialState,
        currentMembership: {
          id: "membership-owner",
          orgId: "org-gaam",
          userId: "owner-1",
          role: "owner",
        },
        planDocuments: [
          planDocument("plan-2026-v1", "strategic", 1),
          review,
        ],
      },
      dispatch,
    } as unknown as AppContextValue;

    render(<MemoryRouter><Strategic /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "Ciclo da estratégia" })).toBeInTheDocument();
    expect(screen.getByText("Atualização pendente")).toBeInTheDocument();
    expect(screen.getByText(/ainda não foram incorporadas ao plano/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Atualizar Plano 2026 com a revisão" }));

    expect(actions[0]).toMatchObject({
      type: "start_session",
      sessionType: "strategic_review",
      period: "2026",
      sourceDocumentId: review.id,
      reviewIntent: "apply_existing_review",
    });
  });
});
