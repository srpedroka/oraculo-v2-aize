import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InlineFeedback } from "../components/ui/InlineFeedback";
import type { AppAction } from "../state/store-contract";
import { useSessionLauncher } from "./useSessionLauncher";

function Harness({ dispatch }: { dispatch: (action: AppAction) => void }) {
  const launcher = useSessionLauncher(dispatch);
  const request = { sessionType: "quarterly" as const, areaId: "area-1", period: "T3 2026" };
  return (
    <>
      <button type="button" onClick={() => launcher.startSession(request)}>Planejar</button>
      {launcher.pending ? <p role="status">Iniciando</p> : null}
      {launcher.error ? (
        <InlineFeedback
          tone="error"
          title={launcher.error.title}
          description={launcher.error.description}
          occurrenceId={launcher.error.occurrenceId}
          actionLabel="Tentar novamente"
          onAction={launcher.retry}
        />
      ) : null}
    </>
  );
}

describe("useSessionLauncher", () => {
  afterEach(cleanup);

  it("bloqueia duplo clique, mostra erro recuperável e repete o mesmo pedido", () => {
    const actions: AppAction[] = [];
    const dispatch = vi.fn((action: AppAction) => actions.push(action));
    render(<Harness dispatch={dispatch} />);

    const button = screen.getByRole("button", { name: "Planejar" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Iniciando");

    const first = actions[0];
    if (first.type !== "start_session") throw new Error("Ação inesperada");
    act(() => first.onError?.("POST /functions/v1/oracle-session status 500"));

    expect(screen.getByRole("alert")).toHaveTextContent("Não consegui iniciar esta condução.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(dispatch).toHaveBeenCalledTimes(2);

    const second = actions[1];
    if (second.type !== "start_session") throw new Error("Ação inesperada");
    expect(second).toMatchObject({ sessionType: "quarterly", areaId: "area-1", period: "T3 2026" });
  });
});

