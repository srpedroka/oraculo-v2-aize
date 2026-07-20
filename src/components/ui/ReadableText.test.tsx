import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReadableText } from "./ReadableText";

describe("ReadableText", () => {
  afterEach(cleanup);

  it("transforma marcadores e links em conteúdo legível", () => {
    render(<ReadableText value={"## Perfil\n- **Setor:** Indústria\n[Site da empresa](https://example.com)"} />);

    expect(screen.getByText("Perfil")).toBeTruthy();
    expect(screen.getByText("Setor:").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "Site da empresa" }).getAttribute("href")).toBe("https://example.com");
    expect(screen.queryByText(/##|\*\*/)).toBeNull();
  });
});
