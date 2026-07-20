import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialState } from "../data/seed";
import type { AppAction, AppContextValue } from "../state/store-contract";

const storeMock = vi.hoisted(() => ({ value: null as AppContextValue | null }));

vi.mock("../state/store", () => ({
  useAppState: () => storeMock.value as AppContextValue,
}));

vi.mock("../lib/frontendError", () => ({ reportFrontendError: vi.fn().mockResolvedValue(undefined) }));

import { OraclePanel } from "./OraclePanel";

function renderPanel(dispatch: (action: AppAction) => void, activeSession = initialState.activeSession) {
  storeMock.value = {
    state: {
      ...initialState,
      activeSession,
      chatMessages: [],
      ui: { ...initialState.ui, oracleMode: "normal" },
    },
    dispatch,
  } as unknown as AppContextValue;
  return render(<MemoryRouter><OraclePanel /></MemoryRouter>);
}

describe("OraclePanel recovery", () => {
  afterEach(() => {
    cleanup();
    storeMock.value = null;
  });

  it("preserva a mensagem até o servidor aceitar e permite repetir uma falha", () => {
    const actions: AppAction[] = [];
    const dispatch = vi.fn((action: AppAction) => actions.push(action));
    renderPanel(dispatch);

    const input = screen.getByPlaceholderText("Escreva para o Oráculo");
    fireEvent.change(input, { target: { value: "Meu avanço desta semana" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    expect(input).toHaveValue("Meu avanço desta semana");
    const first = actions.find((action) => action.type === "send_oracle_message");
    if (!first || first.type !== "send_oracle_message") throw new Error("Envio não encontrado");
    act(() => first.onError?.("POST /functions/v1/oracle-chat status 500"));

    expect(input).toHaveValue("Meu avanço desta semana");
    expect(screen.getByRole("alert")).toHaveTextContent("Não consegui enviar sua mensagem.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    const sends = actions.filter((action) => action.type === "send_oracle_message");
    expect(sends).toHaveLength(2);
    const second = sends[1];
    if (second.type !== "send_oracle_message") throw new Error("Reenvio não encontrado");
    act(() => second.onSuccess?.());
    expect(input).toHaveValue("");
  });

  it("bloqueia confirmação duplicada enquanto a gravação está em andamento", () => {
    const actions: AppAction[] = [];
    const dispatch = vi.fn((action: AppAction) => actions.push(action));
    renderPanel(dispatch, {
      id: "session-1",
      orgId: "org-1",
      areaId: null,
      userId: "user-1",
      conversationId: "conversation-1",
      type: "strategic",
      period: "2026",
      phase: "sintese",
      state: {},
      pendingProposal: { type: "save_strategic_plan" },
      status: "active",
      createdAt: "2026-07-19T12:00:00.000Z",
      completedAt: null,
    });

    const confirm = screen.getByRole("button", { name: "Confirmar e gravar" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(actions.filter((action) => action.type === "confirm_session_proposal")).toHaveLength(1);
    expect(confirm).toBeDisabled();
  });
});
