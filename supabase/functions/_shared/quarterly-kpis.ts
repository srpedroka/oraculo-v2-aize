const KPI_LABELS: Record<string, string> = {
  revenue: "Faturamento",
  operating_margin: "Margem operacional",
  production: "Produção",
  cash: "Caixa",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function comparable(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function quarterlyKpiKey(value: unknown) {
  const canonical = text(value).toLowerCase();
  if (Object.hasOwn(KPI_LABELS, canonical)) return canonical;
  const normalized = comparable(value);
  if (normalized === "faturamento" || normalized === "receita") return "revenue";
  if (normalized === "margem operacional" || normalized === "margem") return "operating_margin";
  if (normalized === "producao") return "production";
  if (normalized === "caixa") return "cash";
  return "";
}

export function quarterlyKpiLabel(value: unknown) {
  const key = quarterlyKpiKey(value);
  return KPI_LABELS[key] ?? text(value);
}

export function isExplicitQuarterlyKpiHypothesisChoiceReply(value: unknown) {
  const raw = text(value);
  const normalized = comparable(raw);
  const uncertaintyIsExplicit = normalized.includes("nao comprov")
    || normalized.includes("ainda sendo hipotese")
    || normalized.includes("apenas como hipotese");
  return raw.includes("?")
    && normalized.includes("hipotese")
    && normalized.includes("margem operacional")
    && normalized.includes("vincul")
    && uncertaintyIsExplicit;
}

export function normalizeQuarterlyKpiLink(value: unknown) {
  const source = typeof value === "string" ? { kpiKey: value } : asRecord(value);
  const key = quarterlyKpiKey(
    source.kpiKey ?? source.kpi_key ?? source.kpi ?? source.label ?? source.name,
  );
  if (!key) return source;
  const linkType = comparable(source.linkType ?? source.link_type ?? source.tipo ?? source.type);
  const rationale = text(source.rationale ?? source.justificativa)
    || (linkType.includes("hypoth") || linkType.includes("hipot")
      ? "Hipótese confirmada pelo gestor; efeito causal ainda não comprovado."
      : "");
  return { ...source, kpiKey: key, rationale };
}

export function normalizeQuarterlyKpiLinks(proposalValue: unknown) {
  const proposal = asRecord(proposalValue);
  if (text(proposal.type) !== "save_quarterly_plan") return proposalValue;
  const objectiveKey = Array.isArray(proposal.quarterlyObjectives)
    ? "quarterlyObjectives"
    : "objetivos_trimestre";
  const objectives = asArray(proposal[objectiveKey]).map(asRecord).map((objective) => {
    const linkKey = Array.isArray(objective.kpiLinks) ? "kpiLinks" : "kpi_links";
    if (!Array.isArray(objective[linkKey])) return objective;
    return {
      ...objective,
      [linkKey]: asArray(objective[linkKey]).map(normalizeQuarterlyKpiLink),
    };
  });
  return { ...proposal, [objectiveKey]: objectives };
}

type QuarterlyKpiConfirmationContext = {
  userMessage?: unknown;
  previousOracleReply?: unknown;
};

function explicitlyConfirmedKpi(key: string, context: QuarterlyKpiConfirmationContext) {
  const label = comparable(KPI_LABELS[key]);
  const userMessage = comparable(context.userMessage);
  const previousOracleReply = comparable(context.previousOracleReply);
  const directConfirmation = userMessage.includes(label)
    && userMessage.includes("vincul")
    && /\b(?:aceito|autorizo|confirma|confirmo|pode|quero|vamos)\b/.test(userMessage);
  const shortConfirmation = /^(?:sim|confirmo|pode vincular|quero vincular|aceito)[.! ]*$/.test(userMessage)
    && previousOracleReply.includes(label)
    && previousOracleReply.includes("vincul")
    && /\b(?:confirma|quer|deseja|prefere)\b/.test(previousOracleReply);
  return directConfirmation || shortConfirmation;
}

export function retainConfirmedQuarterlyKpiLinks(
  proposalValue: unknown,
  context: QuarterlyKpiConfirmationContext = {},
) {
  const proposal = asRecord(normalizeQuarterlyKpiLinks(proposalValue));
  if (text(proposal.type) !== "save_quarterly_plan") return proposalValue;
  const objectiveKey = Array.isArray(proposal.quarterlyObjectives)
    ? "quarterlyObjectives"
    : "objetivos_trimestre";
  const objectives = asArray(proposal[objectiveKey]).map(asRecord).map((objective) => {
    const linkKey = Array.isArray(objective.kpiLinks) ? "kpiLinks" : "kpi_links";
    if (!Array.isArray(objective[linkKey])) return objective;
    return {
      ...objective,
      [linkKey]: asArray(objective[linkKey]).filter((link) => {
        const record = asRecord(link);
        const key = quarterlyKpiKey(record.kpiKey ?? record.kpi_key ?? record.kpi ?? record.label ?? record.name);
        return !key || explicitlyConfirmedKpi(key, context);
      }),
    };
  });
  return { ...proposal, [objectiveKey]: objectives };
}

export function quarterlyKpiLinks(proposalValue: unknown) {
  const proposal = asRecord(normalizeQuarterlyKpiLinks(proposalValue));
  const objectives = asArray(proposal.quarterlyObjectives ?? proposal.objetivos_trimestre).map(asRecord);
  const seen = new Set<string>();
  return objectives.flatMap((objective) => asArray(objective.kpiLinks ?? objective.kpi_links))
    .map(normalizeQuarterlyKpiLink)
    .filter((link) => {
      const record = asRecord(link);
      const key = quarterlyKpiKey(record.kpiKey ?? record.kpi_key);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
