import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tabs } from "./Tabs";

describe("Tabs", () => {
  afterEach(cleanup);

  it("expõe seleção e permite navegar com as setas", () => {
    const onChange = vi.fn();
    render(
      <Tabs
        ariaLabel="Níveis do plano"
        items={[{ value: "annual", label: "Anual" }, { value: "quarterly", label: "Trimestral" }]}
        value="annual"
        onChange={onChange}
      />,
    );

    const annual = screen.getByRole("tab", { name: "Anual" });
    expect(annual.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(annual, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("quarterly");
  });

  it("troca a faixa extensa por um índice explícito no celular", () => {
    render(
      <Tabs
        ariaLabel="Seções das configurações"
        items={Array.from({ length: 6 }, (_, index) => ({ value: `item-${index}`, label: `Item ${index}` }))}
        value="item-0"
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Seções das configurações" })).toBeTruthy();
  });
});
