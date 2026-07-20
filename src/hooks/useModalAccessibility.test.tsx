import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useModalAccessibility } from "./useModalAccessibility";

function Fixture() {
  const [open, setOpen] = useState(false);
  const dialogRef = useModalAccessibility<HTMLDivElement>({ active: open, onClose: () => setOpen(false) });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Abrir teste</button>
      {open ? (
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Teste" tabIndex={-1}>
          <button type="button" onClick={() => setOpen(false)}>Fechar teste</button>
          <button type="button">Última ação</button>
        </div>
      ) : null}
    </>
  );
}

function NestedFixture() {
  const [outerOpen, setOuterOpen] = useState(false);
  const [innerOpen, setInnerOpen] = useState(false);
  const outerRef = useModalAccessibility<HTMLDivElement>({ active: outerOpen, onClose: () => setOuterOpen(false) });
  const innerRef = useModalAccessibility<HTMLDivElement>({ active: innerOpen, onClose: () => setInnerOpen(false) });
  return (
    <>
      <button type="button" onClick={() => setOuterOpen(true)}>Abrir externo</button>
      {outerOpen ? (
        <div ref={outerRef} role="dialog" aria-modal="true" aria-label="Externo" tabIndex={-1}>
          <button type="button" onClick={() => setInnerOpen(true)}>Abrir interno</button>
          {innerOpen ? (
            <div ref={innerRef} role="dialog" aria-modal="true" aria-label="Interno" tabIndex={-1}>
              <button type="button">Ação interna</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

describe("useModalAccessibility", () => {
  it("trava o foco, fecha com Escape e devolve o foco à origem", () => {
    render(<Fixture />);
    const opener = screen.getByRole("button", { name: "Abrir teste" });
    opener.focus();
    fireEvent.click(opener);

    const close = screen.getByRole("button", { name: "Fechar teste" });
    const last = screen.getByRole("button", { name: "Última ação" });
    expect(close).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("fecha somente o diálogo superior quando há confirmação aninhada", () => {
    render(<NestedFixture />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir externo" }));
    const innerOpener = screen.getByRole("button", { name: "Abrir interno" });
    fireEvent.click(innerOpener);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Interno" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Externo" })).toBeInTheDocument();
    expect(innerOpener).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Externo" })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });
});
