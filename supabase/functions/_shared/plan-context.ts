import { quarterPeriodForMonth } from "./periods.ts";
import { formatUntrustedDocument } from "./untrusted-content.ts";

type Client = any;

export type PlanContextFocus = "org" | "area" | "quarterly" | "monthly" | "semester_review";

const STATUS_LABEL: Record<string, string> = {
  on_track: "No prazo",
  at_risk: "Em risco",
  late: "Atrasado",
  done: "Concluído",
};

const LEVEL_LABEL: Record<string, string> = {
  strategic: "Estratégico",
  area_annual: "Anual da área",
  quarterly: "Trimestral",
  monthly: "Mensal",
};

const TYPE_LABEL: Record<string, string> = {
  harvest: "Resultado",
  seed: "Evolução",
};

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MAX_HISTORICAL_DOCS = 5;
const MAX_HISTORICAL_CHARS_PER_DOC = 1600;
const MAX_PROFILE_CHARS = 1200;
const MAX_SEMESTER_DOCUMENTS = 24;
const MAX_SEMESTER_CHARS_PER_DOCUMENT = 2200;

function text(value: unknown, fallback = "não informado") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => text(item, "")).filter(Boolean) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function rawText(value: unknown) {
  return String(value ?? "").trim();
}

function truncateProfileText(value: unknown) {
  const output = rawText(value)
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  if (!output) return "";
  if (output.length <= MAX_PROFILE_CHARS) return output;
  return `${output.slice(0, MAX_PROFILE_CHARS).trim()}\n[trecho truncado para controlar tokens]`;
}

function companyProfileLines(document: any | null) {
  if (!document) return [];
  const summary = truncateProfileText(asRecord(document.content).summary);
  if (!summary) return [];
  return ["PERFIL DA EMPRESA:", summary];
}

function currentPeriods(date = new Date()) {
  const monthIndex = date.getMonth();
  const year = date.getFullYear();
  const quarter = Math.floor(monthIndex / 3) + 1;
  return {
    year,
    month: `${MONTHS[monthIndex]} ${year}`,
    quarterLabels: [`T${quarter} ${year}`, `Q${quarter} ${year}`],
    quarterDisplay: `T${quarter} ${year}`,
  };
}

export function planContextPeriods(
  focus: PlanContextFocus,
  requestedPeriod: string | null | undefined,
  date = new Date(),
) {
  const periods = currentPeriods(date);
  const periodInFocus = String(requestedPeriod ?? "").trim();
  const explicitQuarter = Boolean(periodInFocus && /^[TQ][1-4]\s+20\d{2}$/i.test(periodInFocus));
  const quarterInFocus = explicitQuarter
    ? periodInFocus.replace(/^Q/i, "T")
    : focus === "monthly" && periodInFocus
    ? quarterPeriodForMonth(periodInFocus, date)
    : periods.quarterDisplay;

  return {
    quarterLabels: [quarterInFocus, quarterInFocus.replace(/^T/i, "Q")],
    quarterDisplay: quarterInFocus,
    monthDisplay: periodInFocus && !explicitQuarter ? periodInFocus : periods.month,
  };
}

function periodMatches(value: unknown, accepted: string[]) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return accepted.some((period) => normalized === period.toLowerCase());
}

function statusLabel(status: unknown) {
  return STATUS_LABEL[String(status ?? "")] ?? text(status, "Sem status");
}

function levelLabel(level: unknown) {
  return LEVEL_LABEL[String(level ?? "")] ?? text(level, "Nível não informado");
}

function typeLabel(type: unknown) {
  return TYPE_LABEL[String(type ?? "")] ?? text(type, "Tipo não informado");
}

export function objectiveLine(objective: any) {
  const objectiveIdLabel = objective.level === "area_annual" ? "id do objetivo anual da área" : "id";
  const details = [
    objective.id ? `${objectiveIdLabel}: ${objective.id}` : "",
    objective.level === "area_annual" && objective.parent_id
      ? `id estratégico vinculado: ${objective.parent_id}`
      : "",
    `${levelLabel(objective.level)}`,
    `${typeLabel(objective.type)}`,
    objective.period ? `período: ${objective.period}` : "",
    `indicador: ${text(objective.metric)}`,
    `meta: ${text(objective.target)}`,
    `atual: ${text(objective.current)}`,
    `prazo: ${text(objective.deadline)}`,
    `dono: ${text(objective.owner)}`,
    `progresso: ${Number(objective.progress ?? 0)}%`,
  ].filter(Boolean);

  const deliverables = asArray(objective.deliverables);
  return [
    `- [${statusLabel(objective.status)}] ${text(objective.title)} (${details.join("; ")})`,
    deliverables.length ? `  Entregas: ${deliverables.join("; ")}` : "",
  ].filter(Boolean).join("\n");
}

function keyActionLine(action: any) {
  return `    - [${statusLabel(action.status)}] ${text(action.description)} (id: ${text(action.id)}; dono: ${text(action.owner)}; prazo: ${text(action.deadline)}; critério: ${text(action.completion_criterion)})`;
}

function dateLabel(value: unknown) {
  const output = String(value ?? "").slice(0, 10);
  return output || "sem data";
}

function coordinatorName(area: any, memberships: any[], profiles: any[]) {
  const membership = memberships.find((item) => item.id === area?.coordinator_id);
  const profile = profiles.find((item) => item.id === membership?.user_id);
  return text(profile?.full_name, "não definido");
}

function objectiveCounts(objectives: any[], areaId: string) {
  const scoped = objectives.filter((objective) => objective.area_id === areaId);
  return {
    annual: scoped.filter((objective) => objective.level === "area_annual").length,
    quarterly: scoped.filter((objective) => objective.level === "quarterly").length,
    monthly: scoped.filter((objective) => objective.level === "monthly").length,
  };
}

function historicalDocumentScore(document: any, focus: PlanContextFocus, areaId: string | null) {
  let score = 0;
  if (areaId && document.area_id === areaId) score += 4;
  if (!document.area_id) score += 2;
  if (focus === "quarterly" && document.type === "quarterly") score += 3;
  if (focus === "quarterly" && document.type === "strategic") score += 1;
  if (focus === "monthly" && document.type === "monthly") score += 3;
  if (focus === "monthly" && document.type === "quarterly") score += 2;
  if (focus === "area" && ["monthly", "quarterly"].includes(document.type)) score += 2;
  if (focus === "org" && document.type === "strategic") score += 3;
  if (focus === "semester_review" && document.type === "strategic") score += 4;
  if (focus === "semester_review" && ["quarterly", "quarter_close"].includes(document.type)) score += 3;
  if (focus === "semester_review" && ["monthly", "month_close"].includes(document.type)) score += 2;
  return score;
}

function semesterYear(period: unknown, fallback = currentPeriods().year) {
  return Number(String(period ?? "").match(/\b20\d{2}\b/)?.[0] ?? fallback);
}

function belongsToFirstSemester(period: unknown, year: number) {
  const normalized = rawText(period).toLowerCase();
  if (!normalized || !normalized.includes(String(year))) return false;
  if (/\b[tq][12]\b/i.test(normalized)) return true;
  return ["jan", "fev", "mar", "abr", "mai", "jun", "janeiro", "fevereiro", "março", "marco", "abril", "maio", "junho"]
    .some((month) => new RegExp(`\\b${month}\\b`, "i").test(normalized));
}

function semesterDocumentText(document: any) {
  const content = asRecord(document.content);
  const summary = rawText(content.summary) || rawText(asRecord(content.classification).summary);
  const raw = rawText(content.raw);
  const canonical = rawText(JSON.stringify({
    contexto: content.contexto_rapido,
    objetivos: content.objetivos,
    fechamento: content.fechamento,
    ajustes: content.ajustes,
  }));
  return [summary, raw || canonical].filter(Boolean).join("\n");
}

export function firstSemesterContextLines(input: {
  year: number;
  objectives: any[];
  actions: any[];
  evidences: any[];
  checkIns: any[];
  kpis: any[];
  kpiValues: any[];
  documents: any[];
  areas: any[];
}) {
  const { year } = input;
  const objectives = input.objectives.filter((objective) => {
    if (objective.level === "strategic") return String(objective.period ?? "").includes(String(year));
    if (objective.level === "area_annual") return String(objective.period ?? "").includes(String(year));
    return belongsToFirstSemester(objective.period, year);
  });
  const objectiveIds = new Set(objectives.map((objective) => objective.id));
  const start = `${year}-01-01`;
  const end = `${year}-06-30T23:59:59.999Z`;
  const evidences = input.evidences.filter((evidence) => objectiveIds.has(evidence.objective_id)
    && String(evidence.created_at ?? "") >= start && String(evidence.created_at ?? "") <= end);
  const checkIns = input.checkIns.filter((checkIn) => belongsToFirstSemester(checkIn.period, year));
  const documents = input.documents.filter((document) => {
    if (document.type === "strategic" && String(document.period ?? "").includes(String(year))) return true;
    if (belongsToFirstSemester(document.period, year)) return true;
    const content = asRecord(document.content);
    const metadata = asRecord(content.source_metadata);
    return Number(metadata.year ?? 0) === year
      && (Number(metadata.quarter ?? 0) <= 2 || /primeiro semestre|t1|t2|jan|fev|mar|abr|mai|jun/i.test(`${document.title ?? ""} ${content.raw ?? ""}`));
  }).slice(0, MAX_SEMESTER_DOCUMENTS);

  const lines = [
    `REVISÃO SEMESTRAL EM FOCO: janeiro a junho de ${year}.`,
    "Use os guias como critérios internos de qualidade. Conduza pela IA a partir do que a pessoa disser; não transforme as fases em questionário nem ignore interrupções, correções ou arquivos oferecidos.",
    "O plano anual original é a referência e deve ser preservado. Só proponha alteração de dado existente quando ela estiver explícita, justificada e visível na confirmação final.",
    "EXECUÇÃO DO PRIMEIRO SEMESTRE POR ÁREA:",
  ];

  for (const area of input.areas) {
    const scoped = objectives.filter((objective) => objective.area_id === area.id);
    if (!scoped.length) continue;
    lines.push(`ÁREA: ${text(area.name)}`);
    for (const objective of scoped) {
      lines.push(objectiveLine(objective));
      const actions = input.actions.filter((action) => action.objective_id === objective.id);
      if (actions.length) lines.push(...actions.map(keyActionLine));
    }
  }

  lines.push("EVIDÊNCIAS REGISTRADAS ENTRE JANEIRO E JUNHO:");
  lines.push(...(evidences.length
    ? evidences.map((evidence) => `- ${dateLabel(evidence.created_at)} | objetivo ${text(evidence.objective_id)}: ${text(evidence.text)}`)
    : ["- Nenhuma evidência registrada no período."]));

  lines.push("CHECK-INS E FECHAMENTOS DO PRIMEIRO SEMESTRE:");
  lines.push(...(checkIns.length
    ? checkIns.map((checkIn) => `- ${text(checkIn.period)} | ${text(checkIn.summary)} | detalhes: ${rawText(JSON.stringify(checkIn.details ?? {})) || "não informados"}`)
    : ["- Nenhum check-in registrado no período."]));

  lines.push("KPIS EXECUTIVOS DE JANEIRO A JUNHO:");
  for (const kpi of input.kpis) {
    const values = input.kpiValues
      .filter((value) => value.kpi_id === kpi.id && Number(value.year) === year && Number(value.month) <= 6)
      .sort((a, b) => Number(a.month) - Number(b.month));
    lines.push(`- ${text(kpi.label)} (${text(kpi.unit)}): ${values.length
      ? values.map((value) => `${MONTHS[Number(value.month) - 1]} meta=${text(value.target_value)} atingido=${text(value.actual_value)}`).join("; ")
      : "sem lançamentos no período"}`);
  }

  lines.push("DOCUMENTOS DO PLANO ANUAL E DO PRIMEIRO SEMESTRE:");
  if (!documents.length) lines.push("- Nenhum documento compatível encontrado.");
  for (const document of documents) {
    const areaName = document.area_id ? input.areas.find((area) => area.id === document.area_id)?.name ?? "Área" : "Empresa";
    lines.push(formatUntrustedDocument({
      fileName: `${text(document.title, "Documento")} | ${text(document.period, "sem período")} | ${areaName}`,
      content: semesterDocumentText(document),
      maxChars: MAX_SEMESTER_CHARS_PER_DOCUMENT,
    }));
  }
  if (input.documents.length > documents.length) {
    lines.push(`COBERTURA DOCUMENTAL: ${documents.length} documento(s) relevante(s) incluído(s) no contexto desta rodada; os demais registros permanecem preservados no histórico.`);
  }
  return lines;
}

export function historicalMemoryLines(
  documents: any[],
  areas: any[],
  options: { focus: PlanContextFocus; areaId: string | null },
) {
  const allowedTypes = new Set(["strategic", "quarterly", "monthly"]);
  const relevant = documents
    .filter((document) => allowedTypes.has(String(document.type ?? "")))
    .filter((document) => {
      if (!options.areaId) return true;
      return !document.area_id || document.area_id === options.areaId;
    })
    .filter((document) => rawText(asRecord(document.content).raw))
    .sort((a, b) => {
      const scoreDelta = historicalDocumentScore(b, options.focus, options.areaId) - historicalDocumentScore(a, options.focus, options.areaId);
      if (scoreDelta) return scoreDelta;
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    })
    .slice(0, MAX_HISTORICAL_DOCS);

  if (!relevant.length) return [];

  const lines = [
    "MEMÓRIA ESTRATÉGICA (planos passados — referência):",
    "Antes de propor um plano novo, use estes documentos para recuperar decisões, metas e tentativas anteriores. Não trate como prova de resultado; quando inferir repetição ou trava, transforme em pergunta construtiva.",
    "Metadados de período ajudam a localizar o documento, mas não mudam o texto-fonte: se o conteúdo disser apenas 'ciclo anterior', preserve essa expressão e não invente um ano no aprendizado.",
  ];

  for (const document of relevant) {
    const content = asRecord(document.content);
    const areaName = document.area_id
      ? areas.find((area) => area.id === document.area_id)?.name ?? "Área"
      : "Empresa";
    const source = rawText(content.source);
    const note = rawText(content.note);
    const sourceMetadata = asRecord(content.source_metadata);
    const metadata = [
      `período: ${text(document.period, "sem período")}`,
      `tipo: ${text(document.type, "sem tipo")}`,
      `escopo: ${areaName}`,
      source ? `fonte: ${source}` : "",
      note ? `nota: ${note}` : "",
      sourceMetadata.managerName ? `responsável original: ${rawText(sourceMetadata.managerName)}` : "",
      sourceMetadata.year ? `ano identificado: ${rawText(sourceMetadata.year)}` : "",
      sourceMetadata.quarter ? `trimestre identificado: T${rawText(sourceMetadata.quarter)}` : "",
    ].filter(Boolean).join("; ");

    lines.push(formatUntrustedDocument({
      fileName: text(document.title, "Documento histórico"),
      content: `${metadata}\n${rawText(content.raw)}`,
      maxChars: MAX_HISTORICAL_CHARS_PER_DOC,
    }));
  }

  return lines;
}

export async function buildPlanContext(
  client: Client,
  orgId: string,
  options: { areaId?: string | null; focus?: PlanContextFocus; period?: string | null } = {},
) {
  const focus = options.focus ?? (options.areaId ? "area" : "org");
  const periods = currentPeriods();
  const { quarterLabels, quarterDisplay, monthDisplay } = planContextPeriods(focus, options.period);
  let historicalDocumentsQuery = client
    .from("plan_documents")
    .select("id, area_id, type, period, title, content, version, created_at")
    .eq("org_id", orgId)
    .eq("origin", "historical")
    .in("type", ["strategic", "quarterly", "monthly"])
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (options.areaId) {
    historicalDocumentsQuery = historicalDocumentsQuery.or(`area_id.is.null,area_id.eq.${options.areaId}`);
  }
  historicalDocumentsQuery = historicalDocumentsQuery.limit(options.areaId ? 40 : 60);
  const companyProfileQuery = client
    .from("plan_documents")
    .select("id, type, period, title, content, version, created_at")
    .eq("org_id", orgId)
    .eq("type", "company_profile")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const semesterDocumentsQuery = focus === "semester_review"
    ? client.from("plan_documents")
      .select("id, area_id, type, origin, period, title, content, version, created_at")
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(80)
    : Promise.resolve({ data: [] });
  const executiveKpisQuery = focus === "semester_review"
    ? client.from("executive_kpis").select("*").eq("org_id", orgId).order("sort_order")
    : Promise.resolve({ data: [] });
  const kpiValuesQuery = focus === "semester_review"
    ? client.from("kpi_monthly_values").select("*").eq("org_id", orgId).eq("year", semesterYear(options.period)).lte("month", 6).order("month")
    : Promise.resolve({ data: [] });
  let evidencesQuery = client.from("evidences").select("*").eq("org_id", orgId).is("archived_at", null).order("created_at", { ascending: false });
  evidencesQuery = focus === "semester_review"
    ? evidencesQuery.gte("created_at", `${semesterYear(options.period)}-01-01`).lt("created_at", `${semesterYear(options.period)}-07-01`)
    : evidencesQuery.limit(30);
  let checkInsQuery = client.from("check_ins").select("*").eq("org_id", orgId).is("archived_at", null).order("created_at", { ascending: false });
  checkInsQuery = checkInsQuery.limit(focus === "semester_review" ? 200 : 12);
  const [
    { data: organization },
    { data: areas },
    { data: memberships },
    { data: strategicPlan },
    { data: areaPlans },
    { data: objectives },
    { data: keyActions },
    { data: evidences },
    { data: checkIns },
    { data: strategicProjects },
    { data: historicalDocuments },
    { data: companyProfile },
    { data: semesterDocuments },
    { data: executiveKpis },
    { data: kpiValues },
  ] = await Promise.all([
    client.from("organizations").select("id, name, subtitle").eq("id", orgId).maybeSingle(),
    client.from("areas").select("id, name, coordinator_id, archived_at").eq("org_id", orgId).order("created_at"),
    client.from("memberships").select("id, user_id, role").eq("org_id", orgId),
    client.from("strategic_plans").select("*").eq("org_id", orgId).order("year", { ascending: false }).limit(1).maybeSingle(),
    client.from("area_plans").select("*").eq("org_id", orgId),
    client.from("objectives").select("*").eq("org_id", orgId).is("archived_at", null).order("created_at"),
    client.from("key_actions").select("*").eq("org_id", orgId).is("archived_at", null).order("created_at"),
    evidencesQuery,
    checkInsQuery,
    client.from("strategic_projects").select("*").eq("org_id", orgId).is("archived_at", null).order("created_at"),
    historicalDocumentsQuery,
    companyProfileQuery,
    semesterDocumentsQuery,
    executiveKpisQuery,
    kpiValuesQuery,
  ]);

  const profileIds = Array.from(new Set((memberships ?? []).map((membership: any) => membership.user_id).filter(Boolean)));
  const { data: profiles } = profileIds.length
    ? await client.from("profiles").select("id, full_name").in("id", profileIds)
    : { data: [] };

  const knownAreas = areas ?? [];
  const allAreas = knownAreas.filter((item: any) => !item.archived_at);
  const activeAreaIds = new Set(allAreas.map((item: any) => item.id));
  const allObjectives = (objectives ?? []).filter((objective: any) =>
    !objective.area_id || activeAreaIds.has(objective.area_id)
  );
  const allActions = keyActions ?? [];
  const area = options.areaId ? allAreas.find((item: any) => item.id === options.areaId) ?? null : null;
  const strategicObjectives = allObjectives.filter((objective: any) => objective.level === "strategic");
  const lines: string[] = [
    `EMPRESA: ${text(organization?.name, "Empresa")}${organization?.subtitle ? ` (${organization.subtitle})` : ""}`,
    `TEMA DO ANO: ${asArray(strategicPlan?.themes).join("; ") || "não definido"} | Ano: ${strategicPlan?.year ?? periods.year}`,
    ...companyProfileLines(companyProfile ?? null),
    "OBJETIVOS ESTRATÉGICOS:",
    ...(strategicObjectives.length ? strategicObjectives.map(objectiveLine) : ["- Nenhum objetivo estratégico cadastrado."]),
  ];

  if ((strategicProjects ?? []).length) {
    lines.push(
      "PROJETOS PRIORITÁRIOS:",
      ...(strategicProjects ?? []).map((project: any) =>
        `- [${statusLabel(project.status)}] ${text(project.name)} (dono: ${text(project.owner)}; prazo: ${text(project.deadline)})`
      ),
    );
  }

  lines.push(...historicalMemoryLines(historicalDocuments ?? [], knownAreas, {
    focus,
    areaId: area?.id ?? options.areaId ?? null,
  }));

  if (!area && focus === "semester_review") {
    lines.push(...firstSemesterContextLines({
      year: semesterYear(options.period),
      objectives: allObjectives,
      actions: allActions,
      evidences: evidences ?? [],
      checkIns: checkIns ?? [],
      kpis: executiveKpis ?? [],
      kpiValues: kpiValues ?? [],
      documents: semesterDocuments ?? [],
      areas: allAreas,
    }));
    return lines.join("\n");
  }

  if (!area && focus === "org") {
    lines.push("ÁREAS CADASTRADAS:");
    if (!allAreas.length) {
      lines.push("- Nenhuma área cadastrada.");
    } else {
      for (const item of allAreas) {
        const counts = objectiveCounts(allObjectives, item.id);
        lines.push(
          `- ${item.name} (coordenador: ${coordinatorName(item, memberships ?? [], profiles ?? [])}; objetivos anuais: ${counts.annual}; trimestrais: ${counts.quarterly}; mensais: ${counts.monthly})`,
        );
      }
    }
    return lines.join("\n");
  }

  if (!area) {
    lines.push("ÁREA EM FOCO: nenhuma área específica informada.");
    return lines.join("\n");
  }

  const scopedObjectives = allObjectives.filter((objective: any) => objective.area_id === area.id);
  const areaPlan = (areaPlans ?? []).find((plan: any) => plan.area_id === area.id) ?? null;
  const annualObjectives = scopedObjectives.filter((objective: any) => objective.level === "area_annual");
  const quarterlyObjectives = scopedObjectives.filter((objective: any) =>
    objective.level === "quarterly" && periodMatches(objective.period, quarterLabels)
  );
  const monthlyObjectives = scopedObjectives.filter((objective: any) =>
    objective.level === "monthly" && periodMatches(objective.period, [monthDisplay])
  );
  const relevantObjectiveIds = new Set([
    ...scopedObjectives.map((objective: any) => objective.id),
    ...strategicObjectives.map((objective: any) => objective.id),
  ]);
  const recentEvidences = (evidences ?? [])
    .filter((evidence: any) => relevantObjectiveIds.has(evidence.objective_id))
    .slice(0, 5);
  const pendingCheckIns = (checkIns ?? [])
    .filter((checkIn: any) => !checkIn.area_id || checkIn.area_id === area.id)
    .filter((checkIn: any) => /pend[eê]ncia|rolad|atras|risco/i.test(String(checkIn.summary ?? "")))
    .slice(0, 3);

  lines.push(
    `ÁREA EM FOCO: ${area.name} (coordenador: ${coordinatorName(area, memberships ?? [], profiles ?? [])})`,
    `  PLANO ANUAL DA ÁREA: ${areaPlan ? text(areaPlan.role?.mission, "missão não informada") : "ainda não cadastrado"}`,
  );

  if (areaPlan?.role?.contribution?.length) {
    lines.push(`  Contribuição para o estratégico: ${asArray(areaPlan.role.contribution).join("; ")}`);
  }

  if (annualObjectives.length) {
    lines.push("  Objetivos anuais da área:", ...annualObjectives.map(objectiveLine));
  } else {
    lines.push("  Objetivos anuais da área: nenhum objetivo anual cadastrado.");
  }

  if (focus === "quarterly" || focus === "monthly" || focus === "area") {
    lines.push(`  TRIMESTRE EM FOCO (${quarterDisplay}):`);
    if (quarterlyObjectives.length) {
      for (const objective of quarterlyObjectives) {
        lines.push(objectiveLine(objective));
        const actions = allActions.filter((action: any) => action.objective_id === objective.id);
        if (actions.length) {
          lines.push("    AÇÕES-CHAVE:", ...actions.map(keyActionLine));
        } else {
          lines.push("    AÇÕES-CHAVE: nenhuma ação-chave cadastrada para este objetivo.");
        }
      }
    } else {
      lines.push("  - Nenhum objetivo trimestral cadastrado para o período vigente.");
    }
  }

  if (focus === "monthly") {
    lines.push(`  MÊS EM FOCO (${monthDisplay}):`);
    if (monthlyObjectives.length) {
      for (const objective of monthlyObjectives) {
        lines.push(objectiveLine(objective));
        const actions = allActions.filter((action: any) => action.objective_id === objective.id);
        if (actions.length) {
          lines.push("    AÇÕES-CHAVE:", ...actions.map(keyActionLine));
        } else {
          lines.push("    AÇÕES-CHAVE: nenhuma ação-chave cadastrada para este objetivo.");
        }
      }
    } else {
      lines.push("  - Nenhum objetivo mensal cadastrado para o período vigente.");
    }
  }

  lines.push("  ÚLTIMAS EVIDÊNCIAS:");
  if (recentEvidences.length) {
    lines.push(...recentEvidences.map((evidence: any) => `  - ${dateLabel(evidence.created_at)}: ${text(evidence.text)}`));
  } else {
    lines.push("  - Nenhuma evidência registrada para a área.");
  }

  lines.push("  PENDÊNCIAS ROLADAS DO ÚLTIMO FECHAMENTO:");
  if (pendingCheckIns.length) {
    lines.push(...pendingCheckIns.map((checkIn: any) => `  - ${text(checkIn.period)}: ${text(checkIn.summary)}`));
  } else {
    lines.push("  - Nenhuma pendência rolada registrada.");
  }

  return lines.join("\n");
}
