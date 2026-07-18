import { describe, expect, it } from "vitest";
import { MONTH_CLOSE_CONDUCTOR } from "./conductors/month-close.ts";
import { MONTHLY_CONDUCTOR } from "./conductors/monthly.ts";
import { PERSONA_ORACULO, REGRAS_DE_SESSAO } from "./conductors/persona.ts";
import { QUARTER_CLOSE_CONDUCTOR } from "./conductors/quarter-close.ts";
import { QUARTERLY_CONDUCTOR } from "./conductors/quarterly.ts";
import { STRATEGIC_REVIEW_CONDUCTOR } from "./conductors/strategic-review.ts";
import { STRATEGIC_CONDUCTOR } from "./conductors/strategic.ts";
import { ADAPTIVE_SESSION_RULES } from "./session-adaptive.ts";

describe("naturalidade dos rituais Q4D", () => {
  it("treats phases as an internal decision map instead of a visible form", () => {
    expect(REGRAS_DE_SESSAO).toContain("mapa interno de decisões");
    expect(REGRAS_DE_SESSAO).toContain("pule o que já estiver cumprido");
    expect(PERSONA_ORACULO).not.toContain("primeiro reflete em uma linha");
    expect(PERSONA_ORACULO).toContain("1 a 3 frases curtas");
  });

  it("forbids canned paraphrase and grounds each next question", () => {
    expect(ADAPTIVE_SESSION_RULES).toContain('Nao use "Entendi: voce quer..."');
    expect(ADAPTIVE_SESSION_RULES).toContain("Cite o fato que motivou a pergunta");
    expect(ADAPTIVE_SESSION_RULES).toContain("Listas servem apenas para opcoes de decisao");
  });

  it("does not force annual, quarterly or monthly metadata recaps", () => {
    expect(STRATEGIC_CONDUCTOR).toContain("Só cite esse contexto quando ele ajudar");
    expect(QUARTERLY_CONDUCTOR).toContain("não use quebra-gelo de formulário");
    expect(MONTHLY_CONDUCTOR).toContain("não recite metadados por obrigação");
  });

  it("keeps honest verdict, learning and a bridge in reviews and closes", () => {
    expect(MONTH_CLOSE_CONDUCTOR).toContain("veredito honesto");
    expect(MONTH_CLOSE_CONDUCTOR).toContain("ponte concreta para o próximo mês");
    expect(QUARTER_CLOSE_CONDUCTOR).toContain("veredito honesto");
    expect(QUARTER_CLOSE_CONDUCTOR).toContain("próximo ciclo");
    expect(STRATEGIC_REVIEW_CONDUCTOR).toContain("por que os ajustes fazem sentido agora");
  });
});
