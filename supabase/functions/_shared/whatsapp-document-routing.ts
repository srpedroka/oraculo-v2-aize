import { normalizeTextForRouting } from "./periods.ts";

export type WhatsAppPlanDocumentType = "strategic" | "strategic_review" | "quarterly" | "monthly" | "month_close" | "quarter_close";

export function inferWhatsAppDocumentType(message: string): WhatsAppPlanDocumentType | null {
  const normalized = normalizeTextForRouting(message);
  const asksReview = /\b(revisao|revisar)\b/.test(normalized);
  const asksClose = /\b(fechamento|fechar|check in|checkin|balanco)\b/.test(normalized);
  if (asksReview && /\b(estrateg|anual|semestre|semestral)\b/.test(normalized)) return "strategic_review";
  if (asksClose && /\b(tri|trimestre|trimestral|q[1-4]|t[1-4])\b/.test(normalized)) return "quarter_close";
  if (asksClose) return "month_close";
  // "Revisão" isolada costuma ser uma retomada ou um pedido de reenvio. O tipo
  // correto vem da sessão ativa; assumir fechamento mensal perde esse contexto.
  if (asksReview) return null;
  if (/\b(estrategico|estrategia|anual|ano)\b/.test(normalized)) return "strategic";
  if (/\b(tri|trimestre|trimestral|q[1-4]|t[1-4])\b/.test(normalized)) return "quarterly";
  if (/\b(mes|mensal|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|abr|mai|jun|jul|ago|set|out|nov|dez)\b/.test(normalized)) return "monthly";
  return null;
}
