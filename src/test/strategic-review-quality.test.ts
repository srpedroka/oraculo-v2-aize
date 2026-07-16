import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const conductor = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/conductors/strategic-review.ts"),
  "utf8",
);

describe("strategic review adaptive quality", () => {
  it("absorbs complete batches and keeps a single final confirmation", () => {
    expect(conductor).toContain("Absorva todos os microajustes explícitos da mensagem");
    expect(conductor).toContain("Não percorra a lista inteira por obrigação");
    expect(conductor).toContain("Faça no máximo uma pergunta de alto valor por resposta");
    expect(conductor).toContain("Não peça confirmação intermediária de cada objetivo ou ajuste");
    expect(conductor).toContain("A única confirmação de gravação é a final");
    expect(conductor).toContain("Aceite um ou vários objetivos na mesma mensagem");
    expect(conductor).toContain("As chaves técnicas metric, target, current e deadline aparecem somente dentro da proposal JSON");
  });

  it("preserves the micro-adjustment boundary", () => {
    expect(conductor).toContain("Isto é microajuste do plano estratégico vivo, não replanejamento");
    expect(conductor).toContain("Nunca crie, exclua, substitua em massa ou renomeie objetivos");
    expect(conductor).toContain("Campos permitidos: metric, target, current, deadline, status");
    expect(conductor).toContain("Nunca invente motivo, número, prazo, objetivo ou mudança implícita");
  });
});
