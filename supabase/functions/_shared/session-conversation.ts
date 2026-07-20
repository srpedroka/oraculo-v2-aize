import { normalizeTextForRouting } from "./periods.ts";

export type SessionAsideKind = "document_handoff" | "process_question";

export function sessionAsideKind(message: string): SessionAsideKind | null {
  const normalized = normalizeTextForRouting(message);
  const document = "(?:arquivo|documento|pdf|planilha|relatorio|apresentacao|anexo)";
  const handoff = "(?:mandar|enviar|compartilhar|anexar|colocar|subir)";
  if (new RegExp(`\\b(?:posso|quero|gostaria|vou|deixa eu)\\b.{0,45}\\b${handoff}\\b.{0,55}\\b${document}\\b`).test(normalized)
    || new RegExp(`\\b${document}\\b.{0,55}\\b${handoff}\\b`).test(normalized)) {
    return "document_handoff";
  }
  if (/\b(?:como funciona|por que|porque)\b.{0,80}\b(?:conversa|sessao|roteiro|pergunta|perguntando|planejamento|revisao)\b/.test(normalized)
    || /\b(?:nao pedi|saiu do trilho|estamos falando de)\b/.test(normalized)) {
    return "process_question";
  }
  return null;
}

export function sessionAsideDirective(kind: SessionAsideKind) {
  const specific = kind === "document_handoff"
    ? "A pessoa quer entregar um arquivo ou pergunta se pode fazê-lo. Responda diretamente que pode enviar, explique em uma frase como você vai usar o conteúdo e preserve o ponto atual para retomar depois da leitura. Não finja que já recebeu ou leu o arquivo."
    : "A pessoa interrompeu o roteiro para questionar ou corrigir a própria conversa. Responda ao ponto dela com honestidade, reconheça eventual desvio e diga em uma frase como seguirá sem perder o contexto.";
  return [
    "Este turno é uma interrupção natural dentro de uma sessão de planejamento.",
    specific,
    "Não avance fase, não faça nova coleta, não gere proposta e não transforme a resposta em formulário.",
    "Responda como conversa casual, calorosa e objetiva, em 1 a 3 frases. A resposta deve ser específica ao que a pessoa acabou de dizer.",
  ].join("\n");
}
