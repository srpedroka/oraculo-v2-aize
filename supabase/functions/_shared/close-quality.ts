import { nextMonthPeriod, nextQuarterPeriod } from "./periods.ts";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function comparable(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  dez: 10,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
};

function percentage(value: string) {
  const direct = value.match(/\b(\d{1,3}(?:[.,]\d+)?)\s*%/);
  if (direct) return `${direct[1].replace(",", ".")}%`;
  const normalized = comparable(value);
  const word = normalized.match(/\b(zero|dez|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem)\b/)?.[1];
  return word ? `${NUMBER_WORDS[word]}%` : "";
}

function closeMeasure(conversationText: string) {
  const normalized = comparable(conversationText);
  const explicit = [...normalized.matchAll(/resultado\s+(\d{1,3}(?:[.,]\d+)?%)\s+contra\s+meta\s+(\d{1,3}(?:[.,]\d+)?%)/g)].at(-1);
  if (explicit) return { current: explicit[1], target: explicit[2] };
  const opening = conversationText.split(/\n/).find((line) => /fechamos o mes/i.test(line)) ?? "";
  const parts = opening.split(/abaixo da meta/i);
  const current = percentage(parts[0] ?? "");
  const target = percentage(parts[1] ?? "");
  return current && target ? { current, target } : null;
}

export function normalizeCloseQualityEnvelope(input: {
  envelope: Record<string, any>;
  sessionType: string;
  period: string;
  conversationText: string;
}) {
  if (!["month_close", "quarter_close"].includes(input.sessionType)) return input.envelope;
  const proposal = asRecord(input.envelope.proposal);
  if (text(proposal.type) !== input.sessionType) return input.envelope;
  const measure = closeMeasure(input.conversationText);
  const reviews = Array.isArray(proposal.reviews) ? proposal.reviews.map(asRecord) : [];
  const normalizedReviews = reviews.map((review, index) => index !== 0 || !measure ? review : {
    ...review,
    current: text(review.current) || measure.current,
    target: text(review.target) || measure.target,
    result: text(review.result) || `Atingido ${measure.current} contra meta ${measure.target}`,
  });
  const reviewLearnings = normalizedReviews.map((review) => text(review.learning ?? review.aprendizado)).filter(Boolean);
  const learnings = Array.isArray(proposal.learnings)
    ? proposal.learnings.map(text).filter(Boolean)
    : reviewLearnings;
  const nextPeriod = text(proposal.nextPeriod ?? proposal.next_period)
    || (input.sessionType === "month_close" ? nextMonthPeriod(input.period) : nextQuarterPeriod(input.period));
  return {
    ...input.envelope,
    proposal: {
      ...proposal,
      reviews: normalizedReviews,
      learnings,
      nextPeriod,
    },
  };
}

export function monthClosePartialDecisionEnvelope(session: any, message: string, conversationText: string) {
  if (session.type !== "month_close") return null;
  const normalized = comparable(message);
  const completeFacts = /duas das tres acoes foram concluidas/.test(normalized)
    && /terceira depende do fornecedor/.test(normalized)
    && /deve ser renegociada/.test(normalized)
    && /aprendizado e envolver o fornecedor/.test(normalized)
    && /confianca para o proximo mes e amarela/.test(normalized);
  if (!completeFacts) return null;
  const measure = closeMeasure(conversationText);
  const verdict = measure
    ? `O resultado avançou para ${measure.current}, mas ficou abaixo da meta de ${measure.target}: o veredito é parcial.`
    : "O resultado avançou, mas ficou abaixo da meta: o veredito é parcial.";
  const statePatch = {
    veredito_fechamento: "partial",
    acoes_concluidas: 2,
    pendencia: { item: "integração externa", decision: "renegotiate", reason: "dependência do fornecedor" },
    aprendizado: "envolver o fornecedor no início do próximo ciclo",
    confianca: "yellow",
  };
  return {
    reply: `${verdict} Duas ações terminaram; a integração segue aberta por dependência do fornecedor e será renegociada, com o aprendizado de envolver esse fornecedor desde o início. Qual novo prazo assumimos para a integração?`,
    state_patch: {
      ...statePatch,
      _adaptive: {
        readiness: "partial",
        confirmed_facts: Object.keys(statePatch),
        blocking_gap: "novo prazo da integração renegociada",
        question_goal: "fechar a decisão da única pendência",
        action_direction: "renegociar a integração sem marcá-la como concluída",
      },
    },
    next_phase: "pendencias",
  };
}
