import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InlineFeedback } from "./InlineFeedback";

describe("InlineFeedback", () => {
  afterEach(cleanup);

  it("anuncia erro, mantém detalhe técnico recolhido e oferece retry", () => {
    const retry = vi.fn();
    render(
      <InlineFeedback
        tone="error"
        title="Não consegui enviar."
        description="Seu texto continua aqui."
        actionLabel="Tentar novamente"
        onAction={retry}
        occurrenceId="ORC-ABC123"
      />,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Seu texto continua aqui.")).toBeInTheDocument();
    expect(screen.getByText("Detalhes técnicos")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("usa live region educada para sucesso", () => {
    render(<InlineFeedback tone="success" title="Plano salvo" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});

