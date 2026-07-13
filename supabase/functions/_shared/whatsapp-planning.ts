import { matchAreaCandidate, type NamedAreaCandidate } from "./area-matching.ts";
import { inferPlanningType, normalizeTextForRouting } from "./periods.ts";

export type CorePlanningType = "strategic" | "quarterly" | "monthly";

export function explicitPlanningRequest(message: string): CorePlanningType | null {
  const type = inferPlanningType(message);
  if (!type) return null;

  const normalized = normalizeTextForRouting(message);
  const asksToStart = /\b(quero|vamos|gostaria|preciso|pode|podemos|iniciar|abrir|criar|montar|fazer|comecar|planejar|novo|nova|retomar|revisar)\b/.test(normalized);
  const namesPlanning = /\b(plano|planejamento|estrategico|trimestral|mensal)\b/.test(normalized);
  return asksToStart && namesPlanning ? type : null;
}
export function resolveAreaFromMessage<T extends NamedAreaCandidate>(message: string, areas: T[]) {
  return matchAreaCandidate(message, areas);
}

export function wantsDocumentAttachment(message: string) {
  const normalized = normalizeTextForRouting(message);
  return /\b(pdf|arquivo|anexo|baixar|download)\b/.test(normalized) ||
    /\b(me envia|me envie|manda|mande|mandar|enviar|colar)\b.*\b(documento|plano|relatorio)\b/.test(normalized) ||
    /\b(documento|plano|relatorio)\b.*\b(pronto|completo|em pdf|como arquivo)\b/.test(normalized);
}
