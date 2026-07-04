type Client = any;

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function asText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function asObjectiveType(value: unknown) {
  const text = asText(value).toLowerCase();
  if (text === "seed" || text.includes("plantio") || text.includes("evolu")) return "seed";
  return "harvest";
}

function cleanDate(value: unknown) {
  const text = asText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function yearFromPeriod(period: string) {
  const match = period.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : new Date().getFullYear();
}

function quarterKey(period: string) {
  const normalized = period.toLowerCase();
  if (normalized.includes("1") || normalized.includes("q1") || normalized.includes("t1")) return "q1";
  if (normalized.includes("2") || normalized.includes("q2") || normalized.includes("t2")) return "q2";
  if (normalized.includes("4") || normalized.includes("q4") || normalized.includes("t4")) return "q4";
  return "q3";
}

async function assertProposalPermission(client: Client, session: any, userId: string) {
  const { data: membership, error } = await client
    .from("memberships")
    .select("id, role")
    .eq("org_id", session.org_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!membership) throw new Error("Sem acesso à empresa");
  if (membership.role === "owner") return membership;
  if (!session.area_id) throw new Error("Coordenador só pode gravar plano da própria área");

  const { data: area, error: areaError } = await client
    .from("areas")
    .select("id")
    .eq("id", session.area_id)
    .eq("org_id", session.org_id)
    .eq("coordinator_id", membership.id)
    .maybeSingle();

  if (areaError) throw areaError;
  if (!area) throw new Error("Coordenador só pode gravar plano da própria área");
  return membership;
}

async function insertObjective(client: Client, values: Record<string, unknown>) {
  const { data, error } = await client.from("objectives").insert(values).select("*").single();
  if (error) throw error;
  return data;
}

async function findObjectiveByTitle(client: Client, orgId: string, areaId: string | null, level: string, title: string) {
  if (!title) return null;
  let query = client.from("objectives").select("*").eq("org_id", orgId).eq("level", level).ilike("title", title);
  query = areaId ? query.eq("area_id", areaId) : query.is("area_id", null);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureAreaAnnualParent(client: Client, session: any, proposal: any, titleHint: string) {
  const year = yearFromPeriod(session.period);
  const annualCandidates = asArray(proposal.annualObjectives);
  const candidate = annualCandidates[0] ?? {};
  const title = asText(candidate.title, asText(titleHint, `Consolidar objetivo anual da área em ${year}`));
  const existing = await findObjectiveByTitle(client, session.org_id, session.area_id, "area_annual", title);
  if (existing) return existing;

  return await insertObjective(client, {
    org_id: session.org_id,
    area_id: session.area_id,
    level: "area_annual",
    type: asObjectiveType(candidate.type),
    title,
    result: "",
    metric: asText(candidate.metric),
    target: asText(candidate.target),
    owner: asText(candidate.owner),
    status: "on_track",
    progress: 0,
    period: String(year),
  });
}

async function ensureQuarterlyParent(client: Client, session: any, titleHint: string) {
  const title = asText(titleHint);
  const existingByTitle = await findObjectiveByTitle(client, session.org_id, session.area_id, "quarterly", title);
  if (existingByTitle) return existingByTitle;

  const { data: existing, error } = await client
    .from("objectives")
    .select("*")
    .eq("org_id", session.org_id)
    .eq("area_id", session.area_id)
    .eq("level", "quarterly")
    .eq("period", session.period)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing;

  const annualParent = await ensureAreaAnnualParent(client, session, {}, `Sustentar evolução anual da área em ${yearFromPeriod(session.period)}`);
  return await insertObjective(client, {
    org_id: session.org_id,
    area_id: session.area_id,
    level: "quarterly",
    type: "seed",
    title: title || `Avançar prioridades do trimestre ${session.period}`,
    result: "",
    owner: "",
    status: "on_track",
    progress: 0,
    deliverables: [],
    parent_id: annualParent.id,
    period: session.period,
  });
}

async function saveStrategicPlan(client: Client, session: any, proposal: any, userId: string) {
  const year = Number(proposal.year ?? yearFromPeriod(session.period));
  const themes = asArray<string>(proposal.themes).length ? asArray<string>(proposal.themes) : [asText(proposal.theme ?? proposal.tema_do_ano)].filter(Boolean);

  const { data: plan, error } = await client
    .from("strategic_plans")
    .upsert(
      {
        org_id: session.org_id,
        year,
        profile: proposal.profile ?? {},
        drivers: proposal.drivers ?? {},
        swot: proposal.swot ?? {},
        themes,
        rituals: asArray<string>(proposal.rituals),
        executive_summary: asText(proposal.executiveSummary ?? proposal.executive_summary),
      },
      { onConflict: "org_id,year" },
    )
    .select("*")
    .single();
  if (error) throw error;

  const objectiveRows = [];
  for (const objective of asArray<any>(proposal.objectives)) {
    objectiveRows.push(
      await insertObjective(client, {
        org_id: session.org_id,
        area_id: null,
        level: "strategic",
        type: asObjectiveType(objective.type),
        title: asText(objective.title, "Objetivo estratégico"),
        result: asText(objective.result),
        metric: asText(objective.metric),
        target: asText(objective.target),
        owner: asText(objective.owner),
        status: "on_track",
        progress: 0,
        period: asText(objective.period, String(year)),
      }),
    );
  }

  for (const project of asArray<any>(proposal.projects)) {
    const linked = objectiveRows.find((objective) => objective.title === project.linkedObjectiveTitle) ?? null;
    const { error: projectError } = await client.from("strategic_projects").insert({
      org_id: session.org_id,
      plan_id: plan.id,
      name: asText(project.name, "Projeto estratégico"),
      owner: asText(project.owner),
      deadline: cleanDate(project.deadline),
      status: "on_track",
      linked_objective_id: linked?.id ?? null,
    });
    if (projectError) throw projectError;
  }

  return `Plano estratégico ${year} gravado com ${objectiveRows.length} objetivo(s).`;
}

async function saveQuarterlyPlan(client: Client, session: any, proposal: any, _userId: string) {
  if (!session.area_id) throw new Error("Plano trimestral exige uma área");
  const year = yearFromPeriod(session.period);
  const annualObjectives = [];

  for (const objective of asArray<any>(proposal.annualObjectives)) {
    annualObjectives.push(
      await insertObjective(client, {
        org_id: session.org_id,
        area_id: session.area_id,
        level: "area_annual",
        type: asObjectiveType(objective.type),
        title: asText(objective.title, "Objetivo anual da área"),
        result: asText(objective.result),
        metric: asText(objective.metric),
        target: asText(objective.target),
        owner: asText(objective.owner),
        status: "on_track",
        progress: 0,
        parent_id: objective.linkedStrategicObjectiveId ?? null,
        period: asText(objective.period, String(year)),
      }),
    );
  }

  const learningFocus = asArray<string>(proposal.learningFocus ?? proposal.foco_aprendizado);
  const qKey = quarterKey(session.period);
  const currentRole = proposal.areaRole ?? {};
  const currentDiagnosis = proposal.diagnosis ?? {};
  const { data: existingAreaPlan, error: existingAreaPlanError } = await client
    .from("area_plans")
    .select("*")
    .eq("area_id", session.area_id)
    .eq("year", year)
    .maybeSingle();
  if (existingAreaPlanError) throw existingAreaPlanError;

  const roleMission = asText(currentRole.mission ?? currentRole.missao, existingAreaPlan?.role?.mission ?? "");
  const roleContribution = asArray<string>(currentRole.contribution ?? currentRole.contribuicao).length
    ? asArray<string>(currentRole.contribution ?? currentRole.contribuicao)
    : asArray<string>(existingAreaPlan?.role?.contribution);
  const strengths = asArray<string>(currentDiagnosis.strengths ?? currentDiagnosis.forcas).length
    ? asArray<string>(currentDiagnosis.strengths ?? currentDiagnosis.forcas)
    : asArray<string>(existingAreaPlan?.diagnosis?.strengths);
  const weaknesses = asArray<string>(currentDiagnosis.weaknesses ?? currentDiagnosis.gargalos ?? currentDiagnosis.fraquezas).length
    ? asArray<string>(currentDiagnosis.weaknesses ?? currentDiagnosis.gargalos ?? currentDiagnosis.fraquezas)
    : asArray<string>(existingAreaPlan?.diagnosis?.weaknesses);
  const mergedLearningFocus = {
    ...(existingAreaPlan?.learning_focus ?? {}),
    ...(learningFocus.length ? { [qKey]: learningFocus } : {}),
  };
  const linkedStrategicObjectiveIds = asArray<string>(proposal.linkedStrategicObjectiveIds).length
    ? asArray<string>(proposal.linkedStrategicObjectiveIds)
    : asArray<string>(existingAreaPlan?.linked_strategic_objective_ids);

  const { error: planError } = await client.from("area_plans").upsert(
    {
      org_id: session.org_id,
      area_id: session.area_id,
      year,
      role: {
        mission: roleMission,
        contribution: roleContribution,
      },
      linked_strategic_objective_ids: linkedStrategicObjectiveIds,
      diagnosis: {
        strengths,
        weaknesses,
      },
      main_annual_objective_id: annualObjectives[0]?.id ?? existingAreaPlan?.main_annual_objective_id ?? null,
      learning_focus: mergedLearningFocus,
    },
    { onConflict: "area_id,year" },
  );
  if (planError) throw planError;

  const quarterlyRows = [];
  for (const objective of asArray<any>(proposal.quarterlyObjectives ?? proposal.objetivos_trimestre)) {
    const parent =
      annualObjectives.find((item) => item.title === objective.parentTitle) ??
      (await findObjectiveByTitle(client, session.org_id, session.area_id, "area_annual", asText(objective.parentTitle))) ??
      (annualObjectives[0] ?? await ensureAreaAnnualParent(client, session, proposal, asText(objective.parentTitle)));

    quarterlyRows.push(
      await insertObjective(client, {
        org_id: session.org_id,
        area_id: session.area_id,
        level: "quarterly",
        type: asObjectiveType(objective.type),
        title: asText(objective.title, "Objetivo trimestral"),
        result: asText(objective.result),
        metric: asText(objective.metric),
        target: asText(objective.target),
        owner: asText(objective.owner),
        status: "on_track",
        progress: 0,
        deliverables: asArray<string>(objective.deliverables ?? objective.entregas),
        parent_id: parent.id,
        period: asText(objective.period, session.period),
      }),
    );
  }

  return `Plano trimestral gravado com ${quarterlyRows.length} objetivo(s).`;
}

async function saveMonthlyPlan(client: Client, session: any, proposal: any, _userId: string) {
  if (!session.area_id) throw new Error("Plano mensal exige uma área");
  const monthlyRows = [];
  const actionRows = [];

  for (const objective of asArray<any>(proposal.objectives ?? proposal.objetivos_mes)) {
    const parent = await ensureQuarterlyParent(client, session, asText(objective.parentTitle ?? objective.vinculo));
    const monthly = await insertObjective(client, {
      org_id: session.org_id,
      area_id: session.area_id,
      level: "monthly",
      type: asObjectiveType(objective.type),
      title: asText(objective.title, "Objetivo mensal"),
      result: asText(objective.result),
      metric: asText(objective.metric),
      target: asText(objective.target),
      owner: asText(objective.owner),
      status: "on_track",
      progress: 0,
      parent_id: parent.id,
      period: asText(objective.period, session.period),
    });
    monthlyRows.push(monthly);

    for (const action of asArray<any>(objective.actions ?? objective.acoes)) {
      const { data, error } = await client
        .from("key_actions")
        .insert({
          org_id: session.org_id,
          objective_id: monthly.id,
          description: asText(action.description ?? action.descricao, "Ação-chave"),
          completion_criterion: asText(action.completionCriterion ?? action.completion_criterion ?? action.criterio),
          deadline: cleanDate(action.deadline ?? action.prazo),
          owner: asText(action.owner ?? action.responsavel),
          status: "on_track",
        })
        .select("*")
        .single();
      if (error) throw error;
      actionRows.push(data);
    }
  }

  return `Plano mensal gravado com ${monthlyRows.length} objetivo(s) e ${actionRows.length} ação(ões)-chave.`;
}

export async function applyProposal(client: Client, session: any, proposal: any, userId: string) {
  await assertProposalPermission(client, session, userId);
  const type = asText(proposal?.type);
  if (type === "save_strategic_plan") return await saveStrategicPlan(client, session, proposal, userId);
  if (type === "save_quarterly_plan") return await saveQuarterlyPlan(client, session, proposal, userId);
  if (type === "save_monthly_plan") return await saveMonthlyPlan(client, session, proposal, userId);
  throw new Error("Proposta não reconhecida para gravação");
}
