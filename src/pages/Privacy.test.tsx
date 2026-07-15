import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Privacy } from "./Privacy";

describe("Privacy", () => {
  it("explica os fluxos essenciais e o caráter não bloqueante", () => {
    render(<MemoryRouter><Privacy /></MemoryRouter>);

    expect(screen.getByRole("heading", { level: 1, name: "Privacidade e uso de dados" })).toBeInTheDocument();
    expect(screen.getByText(/Supabase hospeda autenticação/)).toBeInTheDocument();
    expect(screen.getByText(/OpenAI, Anthropic, xAI, Moonshot/)).toBeInTheDocument();
    expect(screen.getByText(/O Oráculo não grava o arquivo ou áudio bruto/)).toBeInTheDocument();
    expect(screen.getByText(/filas concluídas saem após 24 horas/)).toBeInTheDocument();
    expect(screen.getByText(/não entram na limpeza automática/)).toBeInTheDocument();
    expect(screen.getByText(/pacote portátil é criptografado/)).toBeInTheDocument();
    expect(screen.getByText(/Isso não bloqueia login, planejamento, Dashboard ou WhatsApp/)).toBeInTheDocument();
  });
});
