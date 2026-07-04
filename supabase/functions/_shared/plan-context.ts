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

function text(value: unknown, fallback = "não informado") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => text(item, "")).filter(Boolean) : [];
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
  ] = await Promise.all([
    client.from("organizations").select("id, name, subtitle").eq("id", orgId).maybeSingle(),
    client.from("areas").select("id, name, coordinator_id").eq("org_id", orgId).order("created_at"),
    client.from("memberships").select("id, user_id, role").eq("org_id", orgId),
    client.from("strategic_plans").select("*").eq("org_id", orgId).order("year", { ascending: false }).limit(1).maybeSingle(),
    client.from("area_plans").select("*").eq("org_id", orgId),
    client.from("objectives").select("*").eq("org_id", orgId).order("created_at"),
    client.from("key_actions").select("*").eq("org_id", orgId).order("created_at"),
    client.from("evidences").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(30),
    client.from("check_ins").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(12),
    client.from("strategic_projects").select("*").eq("org_id", orgId).order("created_at"),
  ]);

  const profileIds = Array.from(new Set((memberships ?? []).map((membership: any) => membership.user_id).filter(Boolean)));
  const { data: profiles } = profileIds.length
    ? await client.from("profiles").select("id, full_name").in("id", profileIds)
    : { data: [] };

  const allAreas = areas ?? [];
  const allObjectives = objectives ?? [];
  const allActions = keyActions ?? [];
  const area = options.areaId ? allAreas.find((item: any) => item.id === options.areaId) ?? null : null;
  const strategicObjectives = allObjectives.filter((objective: any) => objective.level === "strategic");
  const lines: string[] = [
    `EMPRESA: ${text(organization?.name, "Empresa")}${organization?.subtitle ? ` (${organization.subtitle})` : ""}`,
    `TEMA DO ANO: ${asArray(strategicPlan?.themes).join("; ") || "não definido"} | Ano: ${strategicPlan?.year ?? periods.year}`,
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
