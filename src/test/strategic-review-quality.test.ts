import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const conductor = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/conductors/strategic-review.ts"),
  "utf8",
);
const core = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/conductors/nucleo.ts"),
  "utf8",
);

describe("strategic review adaptive quality", () => {
  it("keeps AI ownership of the conversation and a single final confirmation", () => {
    expect(conductor).toContain("Você possui a conversa");
    expect(conductor).toContain("Nunca execute as referências como formulário");
    expect(conductor).toContain("Absorva blocos completos de informação sem obrigar uma entrevista");
    expect(core).toContain("Faça uma pergunta por vez");
    expect(conductor).toContain("Gere uma única proposal completa");
    expect(conductor).toContain("uma única pergunta de confirmação");
    expect(conductor).toContain("Se ele oferecer arquivo, aceite e aguarde a leitura");
  });

  it("preserves history while allowing an explicit, evidence-based annual plan revision", () => {
    expect(conductor).toContain("O histórico nunca é apagado");
    expect(conductor).toContain("No meio do ano, a revisão pode atualizar o plano vigente");
    expect(conductor).toContain("Nunca transforme automaticamente toda prioridade do segundo semestre em objetivo anual");
    expect(conductor).toContain("Não invente número, resultado, causalidade, decisão, responsável ou prazo");
    expect(conductor).toContain("No fechamento do ano, preserve o plano do ano encerrado");
    expect(conductor).toContain('annual_plan_update.mode = "update_current_year"');
    expect(conductor).toContain('annual_plan_update.mode = "prepare_next_year"');
  });
});
