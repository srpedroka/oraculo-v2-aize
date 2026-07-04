type Client = any;

type CloseStatus = "on_track" | "at_risk" | "late" | "done";

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

function clampProgress(value: unknown, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function asCloseStatus(value: unknown): CloseStatus {
  const text = asText(value).toLowerCase();
  if (text === "done" || text.includes("conclu") || text.includes("feito") || text.includes("finaliz")) return "done";
  if (text === "late" || text.includes("nao aconteceu") || text.includes("não aconteceu") || text.includes("atras")) return "late";
  if (text === "at_risk" || text.includes("parcial") || text.includes("risco")) return "at_risk";
  return "on_track";
}

function defaultProgressForStatus(status: CloseStatus) {
  if (status === "done") return 100;
  if (status === "late") return 0;
  if (status === "at_risk") return 50;
  return 0;
}

function normalizeDecision(value: unknown) {
  const text = asText(value).toLowerCase();
  if (text.includes("reneg") || text.includes("prazo") || text.includes("escopo")) return "renegotiate";
  if (text.includes("corta") || text.includes("cancela") || text.includes("cancel") || text.includes("descarta")) return "cut";
  if (text.includes("roll") || text.includes("rola") || text.includes("próximo") || text.includes("proximo")) return "roll";
  return text === "cut" || text === "renegotiate" || text === "roll" ? text : "roll";
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

function nextMonthPeriod(period: string) {
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const normalized = period.toLowerCase();
  const index = months.findIndex((month) => normalized.includes(month.toLowerCase()));
  const year = yearFromPeriod(period);
  if (index < 0) return period;
  const next = new Date(year, index + 1, 1);
  return `${months[next.getMonth()]} ${next.getFullYear()}`;
}

function nextQuarterPeriod(period: string) {
  const current = Number((period.match(/[TQ]([1-4])/i) ?? [])[1] ?? 3);
  const year = yearFromPeriod(period);
  const next = current === 4 ? 1 : current + 1;
  return `T${next} ${current === 4 ? year + 1 : year}`;
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

async function findObjectiveById(client: Client, session: any, objectiveId: unknown, level?: string) {
  const id = asText(objectiveId);
  if (!id) return null;
  let query = client.from("objectives").select("*").eq("id", id).eq("org_id", session.org_id);
  if (level) query = query.eq("level", level);
  if (session.area_id) query = query.eq("area_id", session.area_id);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function findActionById(client: Client, session: any, actionId: unknown) {
  const id = asText(actionId);
  if (!id) return null;
  const { data, error } = await client
    .from("key_actions")
    .select("*")
    .eq("id", id)
    .eq("org_id", session.org_id)
    .maybeSingle();
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

async function copyOpenActionsToObjective(client: Client, session: any, sourceObjectiveId: string, targetObjectiveId: string) {
  const { data: actions, error } = await client
    .from("key_actions")
    .select("*")
    .eq("org_id", session.org_id)
    .eq("objective_id", sourceObjectiveId)
    .neq("status", "done");
  if (error) throw error;

  for (const action of actions ?? []) {
    const { error: insertError } = await client.from("key_actions").insert({
      org_id: session.org_id,
      objective_id: targetObjectiveId,
      description: `${action.description} (rolado de ${session.period})`,
      completion_criterion: action.completion_criterion ?? "",
      deadline: action.deadline,
      owner: action.owner ?? "",
      status: "on_track",
    });
    if (insertError) throw insertError;
  }
}

async function rollObjective(client: Client, session: any, source: any, nextPeriod: string) {
  const rolled = await insertObjective(client, {
    org_id: session.org_id,
    area_id: source.area_id,
    level: source.level,
    type: source.type,
    title: `${source.title} (rolado de ${session.period})`,
    result: source.result ?? "",
    metric: source.metric ?? null,
    target: source.target ?? null,
    current: null,
    trend: source.trend ?? null,
    deadline: source.deadline ?? null,
    owner: source.owner ?? "",
    evidence_plan: source.evidence_plan ?? "",
    status: "on_track",
    progress: 0,
    deliverables: source.deliverables ?? [],
    parent_id: source.parent_id ?? null,
    period: nextPeriod,
  });
  await copyOpenActionsToObjective(client, session, source.id, rolled.id);
  return rolled;
}

async function applyCloseReviews(client: Client, session: any, proposal: any, userId: string, level: "monthly" | "quarterly") {
  let updatedObjectives = 0;
  let updatedActions = 0;
  let insertedEvidences = 0;

  for (const review of asArray<any>(proposal.reviews ?? proposal.revisao ?? proposal.revisao_tri)) {
    const objective = await findObjectiveById(client, session, review.objectiveId ?? review.objective_id, level);
    if (!objective) continue;

    const status = asCloseStatus(review.statusFinal ?? review.status_final ?? review.status);
    const progress = clampProgress(review.progressFinal ?? review.progress_final ?? review.progress, defaultProgressForStatus(status));
    const { error: objectiveError } = await client
      .from("objectives")
      .update({ status, progress, current: asText(review.current ?? review.valor_atual, objective.current ?? "") || objective.current })
      .eq("id", objective.id)
      .eq("org_id", session.org_id);
    if (objectiveError) throw objectiveError;
    updatedObjectives += 1;

    const evidence = asText(review.evidence ?? review.evidencia);
    if (evidence) {
      const { error: evidenceError } = await client.from("evidences").insert({
        org_id: session.org_id,
        objective_id: objective.id,
        text: evidence,
        created_by: userId,
      });
      if (evidenceError) throw evidenceError;
      insertedEvidences += 1;
    }

    for (const actionReview of asArray<any>(review.actions ?? review.acoes)) {
      const action = await findActionById(client, session, actionReview.id ?? actionReview.actionId ?? actionReview.action_id);
      if (!action) continue;
      const actionStatus = asCloseStatus(actionReview.status);
      const { error: actionError } = await client
        .from("key_actions")
        .update({ status: actionStatus })
        .eq("id", action.id)
        .eq("org_id", session.org_id);
      if (actionError) throw actionError;
      updatedActions += 1;
    }
  }

  return { updatedObjectives, updatedActions, insertedEvidences };
}

async function applyClosePendencies(client: Client, session: any, proposal: any, nextPeriod: string, level: "monthly" | "quarterly") {
  const rolledObjectiveIds = new Map<string, string>();
  let rolled = 0;
  let renegotiated = 0;
  let cut = 0;
  const explicitPendencies = asArray<any>(proposal.pendencies ?? proposal.pendencias);
  const reviewsWithDecision = asArray<any>(proposal.reviews ?? proposal.revisao_tri)
    .filter((review) => asText(review.decision ?? review.decisao));

  for (const item of [...explicitPendencies, ...reviewsWithDecision]) {
    const decision = normalizeDecision(item.decision ?? item.decisao);
    const objective = await findObjectiveById(client, session, item.objectiveId ?? item.objective_id, level);
    const action = await findActionById(client, session, item.actionId ?? item.action_id);

    if (decision === "cut") {
      cut += 1;
      continue;
    }

    if (decision === "renegotiate") {
      const newDeadline = cleanDate(item.newDeadline ?? item.new_deadline ?? item.prazo);
      const newScope = asText(item.newScope ?? item.new_scope ?? item.escopo);
      if (action) {
        const { error } = await client
          .from("key_actions")
          .update({
            ...(newDeadline ? { deadline: newDeadline } : {}),
            ...(newScope ? { description: newScope } : {}),
          })
          .eq("id", action.id)
          .eq("org_id", session.org_id);
        if (error) throw error;
        renegotiated += 1;
      } else if (objective) {
        const { error } = await client
          .from("objectives")
          .update({
            ...(newDeadline ? { deadline: newDeadline } : {}),
            ...(newScope ? { title: newScope } : {}),
          })
          .eq("id", objective.id)
          .eq("org_id", session.org_id);
        if (error) throw error;
        renegotiated += 1;
      }
      continue;
    }

    if (!objective) continue;
    let targetObjectiveId = rolledObjectiveIds.get(objective.id);
    if (!targetObjectiveId) {
      const newObjective = await rollObjective(client, session, objective, nextPeriod);
      targetObjectiveId = newObjective.id;
      rolledObjectiveIds.set(objective.id, targetObjectiveId);
      rolled += 1;
    }

    if (action) {
      const { error } = await client.from("key_actions").insert({
        org_id: session.org_id,
        objective_id: targetObjectiveId,
        description: `${action.description} (rolado de ${session.period})`,
        completion_criterion: action.completion_criterion ?? "",
        deadline: cleanDate(item.newDeadline ?? item.new_deadline) ?? action.deadline,
        owner: action.owner ?? "",
        status: "on_track",
      });
      if (error) throw error;
    }
  }

  return { rolled, renegotiated, cut };
}

async function saveMonthClose(client: Client, session: any, proposal: any, userId: string) {
  if (!session.area_id) throw new Error("Fechamento mensal exige uma área");
  const nextPeriod = asText(proposal.nextPeriod ?? proposal.next_period, nextMonthPeriod(session.period));
  const reviewStats = await applyCloseReviews(client, session, proposal, userId, "monthly");
  const pendencyStats = await applyClosePendencies(client, session, proposal, nextPeriod, "monthly");
  const completionRate = clampProgress(proposal.completionRate ?? proposal.completion_rate, 0);
  const summary = [
    asText(proposal.summary, `Fechamento de ${session.period}`),
    `Conclusão informada: ${completionRate}%.`,
    `Atualizados: ${reviewStats.updatedObjectives} objetivo(s), ${reviewStats.updatedActions} ação(ões), ${reviewStats.insertedEvidences} evidência(s).`,
    `Pendências: ${pendencyStats.rolled} rolada(s), ${pendencyStats.renegotiated} renegociada(s), ${pendencyStats.cut} cortada(s).`,
  ].join(" ");

  const { error } = await client.from("check_ins").insert({
    org_id: session.org_id,
    area_id: session.area_id,
    period: session.period,
    summary,
    created_by: userId,
  });
  if (error) throw error;

  return `Fechamento de ${session.period} gravado com ${reviewStats.updatedObjectives} objetivo(s) revisado(s), ${reviewStats.insertedEvidences} evidência(s) e ${pendencyStats.rolled} pendência(s) rolada(s) para ${nextPeriod}.`;
}

async function saveQuarterClose(client: Client, session: any, proposal: any, userId: string) {
  if (!session.area_id) throw new Error("Fechamento trimestral exige uma área");
  const nextPeriod = asText(proposal.nextPeriod ?? proposal.next_period, nextQuarterPeriod(session.period));
  const reviewStats = await applyCloseReviews(client, session, proposal, userId, "quarterly");
  const pendencyStats = await applyClosePendencies(client, session, proposal, nextPeriod, "quarterly");
  const completionRate = clampProgress(proposal.completionRate ?? proposal.completion_rate, 0);
  const summary = [
    asText(proposal.summary, `Fechamento de ${session.period}`),
    asText(proposal.learningBalance ?? proposal.learning_balance),
    `Conclusão informada: ${completionRate}%.`,
    `Atualizados: ${reviewStats.updatedObjectives} objetivo(s) trimestral(is), ${reviewStats.insertedEvidences} evidência(s).`,
    `Pendências: ${pendencyStats.rolled} rolada(s), ${pendencyStats.renegotiated} renegociada(s), ${pendencyStats.cut} cortada(s).`,
  ].filter(Boolean).join(" ");

  const { error } = await client.from("check_ins").insert({
    org_id: session.org_id,
    area_id: session.area_id,
    period: session.period,
    summary,
    created_by: userId,
  });
  if (error) throw error;

  const nextLearningFocus = asArray<string>(proposal.nextLearningFocus ?? proposal.next_learning_focus);
  if (nextLearningFocus.length) {
    const year = yearFromPeriod(session.period);
    const nextKey = quarterKey(nextPeriod);
    const { data: areaPlan, error: areaPlanError } = await client
      .from("area_plans")
      .select("*")
      .eq("area_id", session.area_id)
      .eq("year", year)
      .maybeSingle();
    if (areaPlanError) throw areaPlanError;
    if (areaPlan) {
      const { error: updateError } = await client
        .from("area_plans")
        .update({ learning_focus: { ...(areaPlan.learning_focus ?? {}), [nextKey]: nextLearningFocus } })
        .eq("id", areaPlan.id);
      if (updateError) throw updateError;
    }
  }

  return `Fechamento de ${session.period} gravado com ${reviewStats.updatedObjectives} objetivo(s) revisado(s) e ${pendencyStats.rolled} pendência(s) rolada(s) para ${nextPeriod}.`;
}

export async function applyProposal(client: Client, session: any, proposal: any, userId: string) {
  await assertProposalPermission(client, session, userId);
  const type = asText(proposal?.type);
  if (type === "save_strategic_plan") return await saveStrategicPlan(client, session, proposal, userId);
  if (type === "save_quarterly_plan") return await saveQuarterlyPlan(client, session, proposal, userId);
  if (type === "save_monthly_plan") return await saveMonthlyPlan(client, session, proposal, userId);
  if (type === "month_close") return await saveMonthClose(client, session, proposal, userId);
  if (type === "quarter_close") return await saveQuarterClose(client, session, proposal, userId);
  throw new Error("Proposta não reconhecida para gravação");
}
