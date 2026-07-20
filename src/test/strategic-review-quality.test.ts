import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const conductor = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/conductors/strategic-review.ts"),
  "utf8",
);

describe("strategic review adaptive quality", () => {
  it("keeps AI ownership of the conversation and a single final confirmation", () => {
    expect(conductor).toContain("Você possui a conversa");
    expect(conductor).toContain("Nunca execute as referências como formulário");
    expect(conductor).toContain("Absorva blocos completos de informação sem obrigar uma entrevista");
    expect(conductor).toContain("Faça no máximo uma pergunta por resposta");
    expect(conductor).toContain("Gere uma única proposal completa");
    expect(conductor).toContain("uma única pergunta de confirmação");
    expect(conductor).toContain("Se ele oferecer arquivo, aceite e aguarde a leitura");
  });

  it("preserves the annual plan while allowing an evidence-based semester direction", () => {
    expect(conductor).toContain("A revisão não apaga, recria ou substitui o Plano Estratégico Anual");
    expect(conductor).toContain("Só altere objetivos estratégicos existentes");
    expect(conductor).toContain("Novas prioridades do segundo semestre ficam no documento da revisão");
    expect(conductor).toContain("Não invente número, resultado, causalidade, decisão, responsável ou prazo");
    expect(conductor).toContain("plano anual original permanece intacto");
  });
});
