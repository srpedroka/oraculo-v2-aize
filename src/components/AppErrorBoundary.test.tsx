import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";

let shouldFail = true;

function UnstableContent() {
  if (shouldFail) throw new Error("segredo que não deve aparecer");
  return <p>Conteúdo recuperado</p>;
}

describe("AppErrorBoundary", () => {
  beforeEach(() => {
    shouldFail = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("substitui a tela branca por uma recuperação sem stack trace", () => {
    render(<AppErrorBoundary><UnstableContent /></AppErrorBoundary>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Não foi possível mostrar esta tela" })).toHaveFocus();
    expect(screen.getByText(/ORC-[A-F0-9]{10}/)).toBeInTheDocument();
    expect(screen.queryByText(/segredo que não deve aparecer/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Dashboard/i })).toHaveAttribute("href", "/");
  });

  it("permite tentar renderizar novamente", () => {
    render(<AppErrorBoundary><UnstableContent /></AppErrorBoundary>);
    shouldFail = false;
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(screen.getByText("Conteúdo recuperado")).toBeInTheDocument();
  });
});
