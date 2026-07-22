import { describe, expect, it } from "vitest";
import { MONTH_CLOSE_CONDUCTOR } from "./conductors/month-close.ts";
import { MONTHLY_CONDUCTOR } from "./conductors/monthly.ts";
import { CONTRATO_TECNICO, NUCLEO_ORACULO } from "./conductors/nucleo.ts";
import { QUARTER_CLOSE_CONDUCTOR } from "./conductors/quarter-close.ts";
import { QUARTERLY_CONDUCTOR } from "./conductors/quarterly.ts";
import { STRATEGIC_REVIEW_CONDUCTOR } from "./conductors/strategic-review.ts";
import { STRATEGIC_CONDUCTOR } from "./conductors/strategic.ts";

describe("naturalidade dos rituais Q4D", () => {
  it("treats phases as an internal decision map instead of a visible form", () => {
    expect(CONTRATO_TECNICO).toContain("mapa de decisões, não um formulário");
    expect(CONTRATO_TECNICO).toContain("pule o que já estiver satisfeito");
    expect(NUCLEO_ORACULO).not.toContain("primeiro reflete em uma linha");
    expect(NUCLEO_ORACULO).not.toContain("1 a 3 frases");
  });

  it("gives positive direction for grounded, natural conversation", () => {
    expect(NUCLEO_ORACULO).toContain("sempre nascida de um fato");
    expect(NUCLEO_ORACULO).toContain("2 ou 3 caminhos concretos");
    expect(NUCLEO_ORACULO).toContain("naturalidade e critério próprio");
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
