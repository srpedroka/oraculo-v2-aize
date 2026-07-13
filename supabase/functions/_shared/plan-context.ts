import { formatUntrustedDocument } from "./untrusted-content.ts";

type Client = any;

export type PlanContextFocus = "org" | "area" | "quarterly" | "monthly";

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

function objectiveLine(objective: any) {
  const details = [
    objective.id ? `id: ${objective.id}` : "",
    `${levelLabel(objective.level)}`,
    `${typeLabel(objective.type)}`,
    objective.period ? `período: ${objective.period}` : "",
    `meta: ${text(objective.target)}`,
    `atual: ${text(objective.current)}`,
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
  return score;
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
  const periodInFocus = String(options.period ?? "").trim();
  const quarterLabels = periodInFocus && /^[TQ][1-4]\s+20\d{2}$/i.test(periodInFocus)
    ? [periodInFocus.replace(/^Q/i, "T"), periodInFocus.replace(/^T/i, "Q")]
    : periods.quarterLabels;
  const quarterDisplay = quarterLabels[0] ?? periods.quarterDisplay;
  const monthDisplay = periodInFocus && !/^[TQ][1-4]\s+20\d{2}$/i.test(periodInFocus) ? periodInFocus : periods.month;
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
  ] = await Promise.all([
    client.from("organizations").select("id, name, subtitle").eq("id", orgId).maybeSingle(),
    client.from("areas").select("id, name, coordinator_id, archived_at").eq("org_id", orgId).order("created_at"),
    client.from("memberships").select("id, user_id, role").eq("org_id", orgId),
    client.from("strategic_plans").select("*").eq("org_id", orgId).order("year", { ascending: false }).limit(1).maybeSingle(),
    client.from("area_plans").select("*").eq("org_id", orgId),
    client.from("objectives").select("*").eq("org_id", orgId).is("archived_at", null).order("created_at"),
    client.from("key_actions").select("*").eq("org_id", orgId).is("archived_at", null).order("created_at"),
    client.from("evidences").select("*").eq("org_id", orgId).is("archived_at", null).order("created_at", { ascending: false }).limit(30),
    client.from("check_ins").select("*").eq("org_id", orgId).is("archived_at", null).order("created_at", { ascending: false }).limit(12),
    client.from("strategic_projects").select("*").eq("org_id", orgId).is("archived_at", null).order("created_at"),
    historicalDocumentsQuery,
    companyProfileQuery,
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
      lines.push(...quarterlyObjectives.map(objectiveLine));
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
