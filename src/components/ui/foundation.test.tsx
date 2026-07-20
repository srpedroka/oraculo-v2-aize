import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "./Button";
import { Card } from "./Card";
import { Field, FieldInput } from "./Field";
import { StatusBadge } from "./StatusBadge";

describe("fundacao visual", () => {
  afterEach(cleanup);

  it("mantem ghost como alias visual de secondary", () => {
    const { rerender } = render(<Button variant="secondary">Cancelar</Button>);
    const secondaryClassName = screen.getByRole("button", { name: "Cancelar" }).className;

    rerender(<Button variant="ghost">Cancelar</Button>);
    expect(screen.getByRole("button", { name: "Cancelar" }).className).toBe(secondaryClassName);
  });

  it("preserva largura e semantica durante loading", () => {
    render(<Button loading>Salvar</Button>);
    const button = screen.getByRole("button", { name: "Salvar" });

    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.classList.contains("h-11")).toBe(true);
  });

  it("mantem card comum sem sombra e reserva elevacao para uso explicito", () => {
    const { rerender } = render(<Card data-testid="card">Conteudo</Card>);
    expect(screen.getByTestId("card").classList.contains("shadow-card")).toBe(false);
    expect(screen.getByTestId("card").classList.contains("shadow-raised")).toBe(false);

    rerender(<Card data-testid="card" elevated>Conteudo</Card>);
    expect(screen.getByTestId("card").classList.contains("shadow-raised")).toBe(true);
  });

  it("oferece estado neutro sem representar sucesso", () => {
    render(<StatusBadge status="unset" />);
    const badge = screen.getByText("Sem avaliação");

    expect(badge.classList.contains("bg-status-neutral-bg")).toBe(true);
    expect(badge.classList.contains("text-status-neutral")).toBe(true);
    expect(badge.classList.contains("bg-status-success-bg")).toBe(false);
  });

  it("liga rotulo, hint e erro ao controle sem perder descricao existente", () => {
    const { rerender } = render(
      <Field id="empresa" label="Empresa" hint="Nome exibido no app" required>
        <FieldInput aria-describedby="ajuda-externa" />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Empresa" });

    expect(input.getAttribute("id")).toBe("empresa");
    expect(input.hasAttribute("required")).toBe(true);
    expect(input.getAttribute("aria-describedby")).toBe("ajuda-externa empresa-hint");
    expect(screen.getByText("Nome exibido no app").getAttribute("id")).toBe("empresa-hint");

    rerender(
      <Field id="empresa" label="Empresa" error="Informe a empresa">
        <FieldInput />
      </Field>,
    );
    expect(screen.getByRole("textbox", { name: "Empresa" }).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").getAttribute("id")).toBe("empresa-error");
  });
});
