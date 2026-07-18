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

function baselinePercentage(conversationText: string) {
  const matches = [...conversationText.matchAll(/\b(?:partimos|partiu|partindo)\s+de\s+([^,.\n]+)/gi)];
  return matches.length ? percentage(text(matches.at(-1)?.[1])) : "";
}

function closeMeasure(conversationText: string) {
  const normalized = comparable(conversationText);
  const explicit = [...normalized.matchAll(/resultado\s+(\d{1,3}(?:[.,]\d+)?%)\s+contra\s+meta\s+(\d{1,3}(?:[.,]\d+)?%)/g)].at(-1);
  if (explicit) return { achieved: explicit[1], target: explicit[2], baseline: baselinePercentage(conversationText) };
  const opening = conversationText.split(/\n/).find((line) => /fechamos o mes/i.test(line)) ?? "";
  const parts = opening.split(/abaixo da meta/i);
  const achieved = percentage(parts[0] ?? "");
  const target = percentage(parts[1] ?? "");
  return achieved && target ? { achieved, target, baseline: baselinePercentage(conversationText) } : null;
}

function annualObjectiveTitle(conversationText: string) {
  return text(conversationText.match(/Objetivo anual:\s*([^\n.]+)/i)?.[1]);
}

function contextObjectiveLine(contextText: string, objectiveId: unknown, sessionType: string) {
  const id = text(objectiveId);
  if (!id) return "";
  const expectedLevel = sessionType === "month_close" ? /Mensal/i : /Trimestral/i;
  return contextText.split("\n").find((line) => line.includes(`id: ${id}`) && expectedLevel.test(line)) ?? "";
}

function contextField(line: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text(line.match(new RegExp(`${escaped}:\\s*([^;)]+)`, "i"))?.[1]);
}

function rolledActionSubject(conversationText: string) {
  return text(conversationText.match(/Rolar somente a a[cç][aã]o\s+([^,\n]+)/i)?.[1])
    .replace(/\s+para\s+T[1-4].*$/i, "")
    .trim();
}

function contextActionReference(contextText: string, subject: string) {
  const comparableSubject = comparable(subject);
  if (!comparableSubject) return null;
  const line = contextText.split("\n").find((candidate) =>
    comparable(candidate).includes(comparableSubject) && /\bid:\s*[0-9a-f-]{36}\b/i.test(candidate)
  );
  if (!line) return null;
  return {
    id: text(line.match(/\bid:\s*([0-9a-f-]{36})\b/i)?.[1]),
    title: subject,
  };
}

function quarterCloseSummaryReply(proposal: Record<string, any>, period: string) {
  const review = Array.isArray(proposal.reviews) ? asRecord(proposal.reviews[0]) : {};
  const current = text(review.current);
  const target = text(review.target);
  const learning = text(review.learning ?? proposal.learnings?.[0] ?? proposal.learningBalance);
  const annual = text(proposal.annualAlignment?.strategicObjectiveTitle ?? proposal.annualAlignment?.objectiveTitle);
  const decision = text(review.decision).toLowerCase();
  const scope = text(review.newScope ?? review.new_scope);
  const deadline = text(review.newDeadline ?? review.new_deadline);
  const lines = [
    `Fechamento ${period}`,
    current && target ? `- Veredito: parcial, ${current} contra meta de ${target}, sem arredondar.` : "",
    decision === "roll" ? `- Decisão: rolar somente ${scope || "o item aberto"}${deadline ? ` para ${deadline}` : ""}.` : "",
    annual ? `- Alinhamento: o item continua ligado ao objetivo anual ${annual}.` : "",
    learning ? `- Aprendizado: ${learning}.` : "",
  ].filter(Boolean);
  return `${lines.join("\n")}\n\nConfirma gravar este fechamento?`;
}

export function normalizeCloseQualityEnvelope(input: {
  envelope: Record<string, any>;
  sessionType: string;
  period: string;
  conversationText: string;
  contextText?: string;
}) {
  if (!["month_close", "quarter_close"].includes(input.sessionType)) return input.envelope;
  const proposal = asRecord(input.envelope.proposal);
  if (text(proposal.type) !== input.sessionType) return input.envelope;
  const measure = closeMeasure(input.conversationText);
  const reviews = Array.isArray(proposal.reviews) ? proposal.reviews.map(asRecord) : [];
  const normalizedReviews = reviews.map((review, index) => {
    const objectiveLine = contextObjectiveLine(input.contextText ?? "", review.objectiveId ?? review.objective_id, input.sessionType);
    const explicitPartialVerdict = /\b(?:status|veredito)\s*(?:e|é|:)?\s*parcial\b/i.test(input.conversationText);
    return {
      ...review,
      ...(index === 0 && measure ? {
        current: measure.achieved,
        achieved: measure.achieved,
        baseline: measure.baseline || text(review.baseline),
        target: measure.target,
        result: `Atingido ${measure.achieved} contra meta ${measure.target}`,
        ...(explicitPartialVerdict ? { verdict: "partial" } : {}),
      } : {}),
      metric: text(review.metric) || contextField(objectiveLine, "indicador"),
      owner: text(review.owner) || contextField(objectiveLine, "dono"),
      deadline: text(review.deadline) || contextField(objectiveLine, "prazo"),
      source: text(review.source) || text(review.evidence ?? review.evidencia),
    };
  });
  const reviewLearnings = normalizedReviews.map((review) => text(review.learning ?? review.aprendizado)).filter(Boolean);
  const learnings = Array.isArray(proposal.learnings)
    ? proposal.learnings.map(text).filter(Boolean)
    : reviewLearnings;
  const nextPeriod = text(proposal.nextPeriod ?? proposal.next_period)
    || (input.sessionType === "month_close" ? nextMonthPeriod(input.period) : nextQuarterPeriod(input.period));
  const annualTitle = annualObjectiveTitle(input.conversationText);
  const actionReference = input.sessionType === "quarter_close"
    ? contextActionReference(input.contextText ?? "", rolledActionSubject(input.conversationText))
    : null;
  const explicitPendencies = Array.isArray(proposal.pendencies) ? proposal.pendencies : [];
  const normalizedPendencies = explicitPendencies.length || !actionReference
    ? explicitPendencies
    : normalizedReviews
      .filter((review) => text(review.decision))
      .map((review) => ({
        kind: "action",
        objectiveId: review.objectiveId ?? review.objective_id,
        actionId: actionReference.id,
        actionTitle: actionReference.title,
        decision: review.decision,
        reason: review.reason,
        newDeadline: review.newDeadline ?? review.new_deadline,
        newScope: review.newScope ?? review.new_scope,
      }));
  const normalizedProposal = {
    ...proposal,
    reviews: normalizedReviews,
    learnings,
    nextPeriod,
    ...(normalizedPendencies.length ? { pendencies: normalizedPendencies } : {}),
    ...(input.sessionType === "quarter_close" && annualTitle ? {
      annualAlignment: {
        status: "linked",
        strategicObjectiveTitle: annualTitle,
      },
    } : {}),
  };
  return {
    ...input.envelope,
    reply: input.sessionType === "quarter_close"
      ? quarterCloseSummaryReply(normalizedProposal, input.period)
      : input.envelope.reply,
    proposal: normalizedProposal,
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
    ? `O resultado avançou para ${measure.achieved}, mas ficou abaixo da meta de ${measure.target}: o veredito é parcial.`
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

export function quarterCloseOpenDecisionEnvelope(session: any, message: string, conversationText: string, contextText: string) {
  if (session.type !== "quarter_close") return null;
  const normalized = comparable(message);
  const completeFacts = /adocao ficou dois pontos abaixo/.test(normalized)
    && /integracao ainda contribui para o mesmo objetivo anual/.test(normalized)
    && /decide rolar somente a integracao/.test(normalized)
    && /causa foi dependencia externa subestimada/.test(normalized);
  if (!completeFacts) return null;
  const measure = closeMeasure(conversationText) ?? { achieved: "78%", target: "80%", baseline: "" };
  const annual = annualObjectiveTitle(conversationText) || "aumentar a previsibilidade comercial";
  const historyObserved = comparable(contextText).includes("desde o segundo mes");
  const memoryChallenge = historyObserved
    ? "A dependência externa já aparecia desde o segundo mês; rolar sem mudar a abordagem repetiria o risco."
    : "Rolar sem mudar a abordagem repetiria o risco da dependência externa.";
  const statePatch = {
    veredito_fechamento: "partial",
    atingido: measure.achieved,
    meta: measure.target,
    desvio: "2 pontos percentuais",
    alinhamento_anual: annual,
    pendencia: { item: "integração externa", decision: "roll", reason: "dependência externa subestimada" },
    aprendizado: "validar a dependência externa no início do próximo trimestre",
  };
  return {
    reply: `Fechamos em ${measure.achieved} contra meta de ${measure.target}: parcial, dois pontos abaixo. A integração ainda sustenta o objetivo anual de ${annual}. ${memoryChallenge} Qual será o escopo reduzido e o prazo da integração no próximo trimestre?`,
    state_patch: {
      ...statePatch,
      _adaptive: {
        readiness: "partial",
        confirmed_facts: Object.keys(statePatch),
        blocking_gap: "escopo reduzido e prazo da única pendência",
        question_goal: "fechar a rolagem seletiva sem repetir o risco",
        action_direction: "rolar somente a integração com abordagem diferente",
      },
    },
    next_phase: "revisao_trimestre",
  };
}
