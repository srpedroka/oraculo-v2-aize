import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialState } from "../data/seed";
import type { PlanningSession } from "../types";
import type { AppAction, AppContextValue, ConfirmSessionProposalResult } from "../state/store-contract";

const storeMock = vi.hoisted(() => ({ value: null as AppContextValue | null }));

vi.mock("../state/store", () => ({
  useAppState: () => storeMock.value as AppContextValue,
}));

vi.mock("../lib/frontendError", () => ({ reportFrontendError: vi.fn().mockResolvedValue(undefined) }));

import { OraclePanel } from "./OraclePanel";

function renderPanel(
  dispatch: (action: AppAction) => void,
  activeSession = initialState.activeSession,
  planningSessions: PlanningSession[] = activeSession ? [activeSession] : [],
) {
  storeMock.value = {
    state: {
      ...initialState,
      activeSession,
      planningSessions,
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

  it.each([
    ["strategic", { type: "save_strategic_plan", year: 2026 }, "Plano Estratégico 2026"],
    ["quarterly", { type: "save_quarterly_plan", period: "T3 2026" }, "Plano Trimestral T3 2026"],
    ["monthly", { type: "save_monthly_plan", period: "Jul 2026" }, "Plano Mensal Jul 2026"],
    ["month_close", { type: "month_close", period: "Jun 2026" }, "Fechamento do Mês Jun 2026"],
    ["quarter_close", { type: "quarter_close", period: "T2 2026" }, "Fechamento do Trimestre T2 2026"],
    ["strategic_review", { type: "apply_strategic_review", period: "S1 2026" }, "Revisão Semestral S1 2026"],
  ] as const)("mostra uma prévia estruturada para %s", (type, pendingProposal, expectedTitle) => {
    const dispatch = vi.fn();
    const proposalFields = pendingProposal as Record<string, string | number>;
    renderPanel(dispatch, {
      id: `session-${type}`,
      orgId: "org-1",
      areaId: null,
      userId: "user-1",
      conversationId: `conversation-${type}`,
      type,
      period: String(proposalFields.period ?? proposalFields.year),
      phase: "sintese",
      state: {},
      pendingProposal,
      status: "active",
      createdAt: "2026-07-20T12:00:00.000Z",
      completedAt: null,
    });

    expect(screen.getByText("Pronto para conferir")).toBeVisible();
    expect(screen.getByText(expectedTitle)).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Confirmar e gravar" })).toHaveLength(1);
  });

  it("ajusta sem preencher texto artificial e preserva a proposta", () => {
    const actions: AppAction[] = [];
    const dispatch = vi.fn((action: AppAction) => actions.push(action));
    renderPanel(dispatch, {
      id: "session-adjust",
      orgId: "org-1",
      areaId: null,
      userId: "user-1",
      conversationId: "conversation-adjust",
      type: "monthly",
      period: "Jul 2026",
      phase: "sintese",
      state: {},
      pendingProposal: { type: "save_monthly_plan", period: "Jul 2026" },
      status: "active",
      createdAt: "2026-07-20T12:00:00.000Z",
      completedAt: null,
    });

    fireEvent.click(screen.getByRole("button", { name: "Ajustar" }));
    const input = screen.getByPlaceholderText("O que você quer mudar?");
    expect(input).toHaveValue("");
    expect(screen.getByText("Ajustando a proposta")).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirmar e gravar" })).toBeDisabled();

    fireEvent.change(input, { target: { value: "Trocar o prazo para 25 de julho" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    const adjustment = actions.find((action) => action.type === "send_session_message");
    expect(adjustment).toMatchObject({ sessionId: "session-adjust", text: "Trocar o prazo para 25 de julho" });
  });

  it("confirma o descarte apenas uma vez e permite manter a proposta", () => {
    const actions: AppAction[] = [];
    const dispatch = vi.fn((action: AppAction) => actions.push(action));
    renderPanel(dispatch, {
      id: "session-discard",
      orgId: "org-1",
      areaId: null,
      userId: "user-1",
      conversationId: "conversation-discard",
      type: "quarterly",
      period: "T3 2026",
      phase: "sintese",
      state: {},
      pendingProposal: { type: "save_quarterly_plan", period: "T3 2026" },
      status: "active",
      createdAt: "2026-07-20T12:00:00.000Z",
      completedAt: null,
    });

    fireEvent.click(screen.getByRole("button", { name: "Descartar proposta" }));
    expect(screen.getByText("Descartar este rascunho?")).toBeVisible();
    expect(actions.filter((action) => action.type === "abandon_session")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Manter proposta" }));
    expect(screen.queryByText("Descartar este rascunho?")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Descartar proposta" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(actions.filter((action) => action.type === "abandon_session")).toHaveLength(1);
  });

  it("mostra sucesso e o documento retornado pelo servidor", () => {
    const actions: AppAction[] = [];
    const dispatch = vi.fn((action: AppAction) => actions.push(action));
    renderPanel(dispatch, {
      id: "session-success",
      orgId: "org-1",
      areaId: null,
      userId: "user-1",
      conversationId: "conversation-success",
      type: "strategic",
      period: "2026",
      phase: "sintese",
      state: {},
      pendingProposal: { type: "save_strategic_plan", year: 2026 },
      status: "active",
      createdAt: "2026-07-20T12:00:00.000Z",
      completedAt: null,
    });

    fireEvent.click(screen.getByRole("button", { name: "Confirmar e gravar" }));
    const confirmation = actions.find((action) => action.type === "confirm_session_proposal");
    if (!confirmation || confirmation.type !== "confirm_session_proposal") throw new Error("Confirmação não encontrada");
    const result: ConfirmSessionProposalResult = {
      sessionId: "session-success",
      reply: "Plano salvo",
      document: { id: "doc-1", title: "Plano Estratégico 2026", type: "strategic", period: "2026", version: 1 },
    };
    act(() => confirmation.onSuccess?.(result));

    expect(screen.getByRole("status")).toHaveTextContent("Registro gravado");
    expect(screen.getByRole("button", { name: "Abrir documento" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Confirmar e gravar" })).not.toBeInTheDocument();
  });

  it("mantém acesso a Documentos quando o backend anterior não devolve o documento", () => {
    const actions: AppAction[] = [];
    const dispatch = vi.fn((action: AppAction) => actions.push(action));
    renderPanel(dispatch, {
      id: "session-compatible",
      orgId: "org-1",
      areaId: null,
      userId: "user-1",
      conversationId: "conversation-compatible",
      type: "strategic",
      period: "2026",
      phase: "sintese",
      state: {},
      pendingProposal: { type: "save_strategic_plan", year: 2026 },
      status: "active",
      createdAt: "2026-07-20T12:00:00.000Z",
      completedAt: null,
    });

    fireEvent.click(screen.getByRole("button", { name: "Confirmar e gravar" }));
    const confirmation = actions.find((action) => action.type === "confirm_session_proposal");
    if (!confirmation || confirmation.type !== "confirm_session_proposal") throw new Error("Confirmação não encontrada");
    act(() => confirmation.onSuccess?.({ sessionId: "session-compatible", reply: "Plano salvo", document: null }));

    expect(screen.getByRole("button", { name: "Abrir Documentos" })).toBeVisible();
  });

  it("mantém a condução mais recente e permite trocar sem uma proposta antiga assumir o painel", () => {
    const older: PlanningSession = {
      id: "session-older",
      orgId: "org-1",
      areaId: null,
      userId: "user-1",
      conversationId: "conversation-older",
      type: "strategic",
      period: "2026",
      phase: "sintese",
      state: {},
      pendingProposal: { type: "save_strategic_plan", year: 2026 },
      status: "active",
      createdAt: "2026-07-19T12:00:00.000Z",
      completedAt: null,
    };
    const newer: PlanningSession = {
      ...older,
      id: "session-newer",
      conversationId: "conversation-newer",
      type: "monthly",
      period: "Jul 2026",
      phase: "acoes_chave",
      pendingProposal: null,
      createdAt: "2026-07-20T12:00:00.000Z",
    };

    renderPanel(vi.fn(), older, [newer, older]);

    expect(screen.getByText("Plano Mensal em andamento")).toBeVisible();
    expect(screen.queryByText("Pronto para conferir")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Condução atual" }), { target: { value: older.id } });
    expect(screen.getByText("Pronto para conferir")).toBeVisible();
    expect(screen.getByText("Plano Estratégico 2026")).toBeVisible();
  });
});
