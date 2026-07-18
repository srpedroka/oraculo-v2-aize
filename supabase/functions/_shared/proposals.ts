import { createDocumentForProposal } from "./plan-documents.ts";
import { validateMonthlyProposal } from "./monthly-guidance.ts";
import { normalizeMonthlyContinuity } from "./monthly-continuity.ts";
import { quarterPeriodForMonth } from "./periods.ts";
import { normalizeQuarterlySharedActions, uniqueQuarterlyActionEntries } from "./quarterly-actions.ts";
import { normalizeQuarterlyKpiLinks } from "./quarterly-kpis.ts";
import { assertImportedQuarterlyReferences } from "./untrusted-content.ts";

type Client = any;

type CloseStatus = "on_track" | "at_risk" | "late" | "done";
type StrategicReviewField = "metric" | "target" | "current" | "deadline" | "status";

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function asText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function asTextArray(value: unknown) {
  return asArray(value).map((item) => asText(item)).filter(Boolean);
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

function asStrategicReviewField(value: unknown): StrategicReviewField | null {
  const text = asText(value).toLowerCase();
  if (text === "metric" || text === "indicador" || text === "metrica" || text === "métrica") return "metric";
  if (text === "target" || text === "meta") return "target";
  if (text === "current" || text === "atual" || text === "valor_atual" || text === "numero" || text === "número") return "current";
  if (text === "deadline" || text === "prazo") return "deadline";
  if (text === "status") return "status";
  return null;
}

function defaultProgressForStatus(status: CloseStatus) {
  if (status === "done") return 100;
  if (status === "late") return 0;
  if (status === "at_risk") return 50;
  return 0;
}

function snapshotStrategicObjective(objective: any) {
  return {
    id: objective.id,
    titulo: asText(objective.title),
    resultado: asText(objective.result),
    indicador: asText(objective.metric),
    meta: asText(objective.target),
    atual: asText(objective.current),
    prazo: objective.deadline ?? null,
    status: asText(objective.status),
    progresso: Number(objective.progress ?? 0),
    responsavel: asText(objective.owner),
    periodo: asText(objective.period),
  };
}

function strategicReviewValue(objective: any, field: StrategicReviewField) {
  if (field === "metric") return asText(objective.metric);
  if (field === "target") return asText(objective.target);
  if (field === "current") return asText(objective.current);
  if (field === "deadline") return asText(objective.deadline);
  return asText(objective.status);
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
  if (!session.area_id) {
    if (membership.role === "owner") return membership;
    throw new Error("Coordenador só pode gravar plano da própria área");
  }

  const { data: area, error: areaError } = await client
    .from("areas")
    .select("id, coordinator_id")
    .eq("id", session.area_id)
    .eq("org_id", session.org_id)
    .is("archived_at", null)
    .maybeSingle();

  if (areaError) throw areaError;
  if (!area) throw new Error("Área arquivada ou não encontrada");
  if (membership.role !== "owner" && area.coordinator_id !== membership.id) {
    throw new Error("Coordenador só pode gravar plano da própria área");
  }
  return membership;
}

async function insertObjective(client: Client, values: Record<string, unknown>) {
  const { data, error } = await client.from("objectives").insert(values).select("*").single();
  if (error) throw error;
  return data;
}

async function applyProposedKpiLinks(client: Client, session: any, objectiveRow: any, source: any, userId: string) {
  const allowedKeys = new Set(["revenue", "operating_margin", "production", "cash"]);
  const requested = asArray<any>(source?.kpiLinks ?? source?.kpi_links)
    .map((item) => typeof item === "string" ? { kpiKey: item, rationale: "" } : item)
    .filter((item) => allowedKeys.has(asText(item.kpiKey ?? item.kpi_key)))
    .slice(0, 2);
  if (!requested.length) return;

  const keys = requested.map((item) => asText(item.kpiKey ?? item.kpi_key));
  const { data: kpis, error } = await client
    .from("executive_kpis")
    .select("id, kpi_key")
    .eq("org_id", session.org_id)
    .in("kpi_key", keys);
  if (error) throw error;

  const rows = (kpis ?? []).map((kpi: any) => {
    const request = requested.find((item) => asText(item.kpiKey ?? item.kpi_key) === kpi.kpi_key) ?? {};
    return {
      org_id: session.org_id,
      objective_id: objectiveRow.id,
      kpi_id: kpi.id,
      rationale: asText(request.rationale ?? request.justificativa),
      confidence: 1,
      created_by: userId,
    };
  });
  if (!rows.length) return;
  const { error: insertError } = await client.from("objective_kpi_links").upsert(rows, { onConflict: "objective_id,kpi_id" });
  if (insertError) throw insertError;
}

async function findObjectiveById(client: Client, session: any, objectiveId: unknown, level?: string) {
  const id = asText(objectiveId);
  if (!id) return null;
  let query = client.from("objectives").select("*").eq("id", id).eq("org_id", session.org_id).is("archived_at", null);
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
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findObjectiveByTitle(client: Client, orgId: string, areaId: string | null, level: string, title: string) {
  if (!title) return null;
  let query = client.from("objectives").select("*").eq("org_id", orgId).eq("level", level).is("archived_at", null).ilike("title", title);
  query = areaId ? query.eq("area_id", areaId) : query.is("area_id", null);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

function normalizedObjectiveTitle(value: unknown) {
  return asText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function proposalMatchesCanonicalAnnualParent(proposal: any, objective: any, parent: any) {
  if (!parent?.id) return false;
  const strategicParentId = asText(parent.parent_id);
  const linkedStrategicObjectiveIds = asArray<string>(
    proposal.linkedStrategicObjectiveIds ?? proposal.linked_strategic_objective_ids,
  ).map((value) => asText(value)).filter(Boolean);
  if (strategicParentId && linkedStrategicObjectiveIds.includes(strategicParentId)) return true;

  const parentTitle = normalizedObjectiveTitle(parent.title);
  if (!parentTitle) return false;
  const annualAlignment = proposal.annualAlignment ?? proposal.alinhamento_anual ?? {};
  return [
    objective.parentTitle ?? objective.parent_title,
    annualAlignment.strategicObjectiveTitle ?? annualAlignment.strategic_objective_title,
  ].some((value) => normalizedObjectiveTitle(value) === parentTitle);
}

export async function canonicalizeQuarterlyStrategicReferences(client: Client, session: any, proposal: any) {
  const linkedIds = asArray<string>(
    proposal.linkedStrategicObjectiveIds ?? proposal.linked_strategic_objective_ids,
  ).map(asText).filter(Boolean);
  const annualObjectives = asArray<any>(proposal.annualObjectives);
  const annualLinkedIds = annualObjectives
    .map((objective) => asText(objective.linkedStrategicObjectiveId ?? objective.linked_strategic_objective_id))
    .filter(Boolean);
  const requestedIds = Array.from(new Set([...linkedIds, ...annualLinkedIds]));
  if (!requestedIds.length) return proposal;

  const { data, error } = await client
    .from("objectives")
    .select("id, level, parent_id, area_id")
    .eq("org_id", session.org_id)
    .is("archived_at", null)
    .in("id", requestedIds);
  if (error) throw error;

  const references = new Map((data ?? []).map((objective: any) => [asText(objective.id), objective]));
  const canonicalId = (objectiveId: string) => {
    const reference = references.get(objectiveId);
    if (reference?.level === "area_annual"
      && asText(reference.area_id) === asText(session.area_id)
      && asText(reference.parent_id)) {
      return asText(reference.parent_id);
    }
    return objectiveId;
  };

  return {
    ...proposal,
    linkedStrategicObjectiveIds: Array.from(new Set(linkedIds.map(canonicalId))),
    annualObjectives: annualObjectives.map((objective) => {
      const linkedId = asText(objective.linkedStrategicObjectiveId ?? objective.linked_strategic_objective_id);
      return linkedId ? { ...objective, linkedStrategicObjectiveId: canonicalId(linkedId) } : objective;
    }),
  };
}

async function findCanonicalAreaAnnualParent(client: Client, session: any, year: number, existingAreaPlan: any) {
  const objectiveId = asText(existingAreaPlan?.main_annual_objective_id);
  if (!objectiveId || !session.area_id) return null;
  const { data, error } = await client
    .from("objectives")
    .select("*")
    .eq("id", objectiveId)
    .eq("org_id", session.org_id)
    .eq("area_id", session.area_id)
    .eq("level", "area_annual")
    .eq("period", String(year))
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findMonthlyQuarterlyParent(client: Client, session: any, proposal: any, objective: any) {
  const alignment = proposal.quarterlyAlignment ?? proposal.alinhamento_trimestral ?? {};
  const objectiveId = asText(
    objective.linkedQuarterlyObjectiveId
      ?? objective.linked_quarterly_objective_id
      ?? alignment.quarterlyObjectiveId
      ?? alignment.quarterly_objective_id,
  );
  const title = asText(
    objective.parentTitle
      ?? objective.vinculo
      ?? alignment.quarterlyObjectiveTitle
      ?? alignment.quarterly_objective_title,
  );
  const expectedPeriod = quarterPeriodForMonth(session.period);
  const acceptedPeriods = [expectedPeriod, expectedPeriod.replace(/^T/i, "Q")];

  if (objectiveId) {
    const parent = await findObjectiveById(client, session, objectiveId, "quarterly");
    if (!parent || !acceptedPeriods.some((period) => period.toLowerCase() === asText(parent.period).toLowerCase())) {
      throw new Error(`Objetivo trimestral vinculado não pertence a ${expectedPeriod}`);
    }
    return parent;
  }

  if (!title) throw new Error("Plano mensal exige vínculo trimestral existente ou exceção explícita");
  const { data, error } = await client
    .from("objectives")
    .select("*")
    .eq("org_id", session.org_id)
    .eq("area_id", session.area_id)
    .eq("level", "quarterly")
    .in("period", acceptedPeriods)
    .is("archived_at", null)
    .ilike("title", title)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Objetivo trimestral não encontrado em ${expectedPeriod}`);
  return data;
}

async function saveStrategicPlan(client: Client, session: any, proposal: any, userId: string) {
  const year = Number(proposal.year ?? yearFromPeriod(session.period));
  const themes = asArray<string>(proposal.themes).length ? asArray<string>(proposal.themes) : [asText(proposal.theme ?? proposal.tema_do_ano)].filter(Boolean);
  const profile = proposal.profile && typeof proposal.profile === "object" && !Array.isArray(proposal.profile) ? proposal.profile : {};

  const { data: plan, error } = await client
    .from("strategic_plans")
    .upsert(
      {
        org_id: session.org_id,
        year,
        profile: {
          ...profile,
          renunciations: asTextArray(proposal.renunciations ?? proposal.renuncias),
          risks: asTextArray(proposal.risks ?? proposal.riscos ?? proposal.riscos_estrategicos),
          pendingDecisions: asTextArray(proposal.pendingDecisions ?? proposal.pending_decisions ?? proposal.decisoes_pendentes),
          historicalLessons: asTextArray(proposal.historicalLessons ?? proposal.historical_lessons ?? proposal.aprendizados_historicos),
        },
        drivers: proposal.drivers ?? {},
        swot: proposal.swot ?? {},
        themes,
        rituals: asArray<string>(proposal.rituals),
        executive_summary: asText(proposal.executiveSummary ?? proposal.executive_summary),
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,year" },
    )
    .select("*")
    .single();
  if (error) throw error;

  const objectiveRows = [];
  for (const objective of asArray<any>(proposal.objectives)) {
    const inserted = await insertObjective(client, {
      org_id: session.org_id,
      area_id: null,
      level: "strategic",
      type: asObjectiveType(objective.type),
      title: asText(objective.title, "Objetivo estratégico"),
      result: asText(objective.result),
      metric: asText(objective.metric),
      target: asText(objective.target),
      current: asText(objective.current ?? objective.baseline ?? objective.valor_atual),
      deadline: cleanDate(objective.deadline ?? objective.prazo),
      owner: asText(objective.owner),
      evidence_plan: asText(objective.source ?? objective.fonte),
      deliverables: asTextArray(objective.strategies ?? objective.estrategias ?? objective.deliverables ?? objective.entregas),
      status: "on_track",
      progress: 0,
      period: asText(objective.period, String(year)),
    });
    await applyProposedKpiLinks(client, session, inserted, objective, userId);
    objectiveRows.push(inserted);
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

async function saveQuarterlyPlan(client: Client, session: any, proposal: any, userId: string) {
  if (!session.area_id) throw new Error("Plano trimestral exige uma área");
  proposal = normalizeQuarterlyKpiLinks(normalizeQuarterlySharedActions(proposal));
  proposal = await canonicalizeQuarterlyStrategicReferences(client, session, proposal);
  await assertImportedQuarterlyReferences(client, session.org_id, proposal);
  const year = yearFromPeriod(session.period);
  const annualObjectives = [];
  const annualAlignment = proposal.annualAlignment ?? proposal.alinhamento_anual ?? {};
  const annualException = asText(annualAlignment.status).toLowerCase() === "exception";
  if (annualException && !asText(annualAlignment.rationale ?? annualAlignment.justificativa)) {
    throw new Error("Exceção ao alinhamento anual exige justificativa");
  }
  if (annualException && (
    asArray(proposal.annualObjectives).length
    || asArray(proposal.linkedStrategicObjectiveIds).length
  )) {
    throw new Error("Exceção ao alinhamento anual não pode criar ou vincular objetivo anual");
  }

  for (const objective of asArray<any>(proposal.annualObjectives)) {
    const inserted = await insertObjective(client, {
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
    });
    await applyProposedKpiLinks(client, session, inserted, objective, userId);
    annualObjectives.push(inserted);
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
  const canonicalExistingAnnualParent = annualException
    ? null
    : await findCanonicalAreaAnnualParent(client, session, year, existingAreaPlan);

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
      main_annual_objective_id: annualObjectives[0]?.id ?? canonicalExistingAnnualParent?.id ?? null,
      learning_focus: mergedLearningFocus,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "area_id,year" },
  );
  if (planError) throw planError;

  const quarterlyRows = [];
  const actionRows = [];
  for (const objective of asArray<any>(proposal.quarterlyObjectives ?? proposal.objetivos_trimestre)) {
    const parent =
      annualObjectives.find((item) => item.title === objective.parentTitle) ??
      (await findObjectiveByTitle(client, session.org_id, session.area_id, "area_annual", asText(objective.parentTitle))) ??
      (proposalMatchesCanonicalAnnualParent(proposal, objective, canonicalExistingAnnualParent)
        ? canonicalExistingAnnualParent
        : null) ??
      annualObjectives[0] ??
      null;
    if (!parent && !annualException) {
      throw new Error("Plano trimestral exige vínculo anual existente ou exceção explícita");
    }

    const inserted = await insertObjective(client, {
        org_id: session.org_id,
        area_id: session.area_id,
        level: "quarterly",
        type: asObjectiveType(objective.type),
        title: asText(objective.title, "Objetivo trimestral"),
        result: asText(objective.result),
        metric: asText(objective.metric),
        target: asText(objective.target),
        current: asText(objective.current ?? objective.baseline ?? objective.valor_atual),
        deadline: cleanDate(objective.deadline ?? objective.prazo),
        owner: asText(objective.owner),
        evidence_plan: asText(objective.source ?? objective.fonte ?? objective.evidencePlan ?? objective.evidence_plan),
        status: "on_track",
        progress: 0,
        deliverables: asArray<string>(objective.deliverables ?? objective.entregas),
        parent_id: parent?.id ?? null,
        period: asText(objective.period, session.period),
      });
    await applyProposedKpiLinks(client, session, inserted, objective, userId);
    quarterlyRows.push(inserted);

  }

  for (const { action, objectiveIndex } of uniqueQuarterlyActionEntries(proposal)) {
    const objective = quarterlyRows[objectiveIndex] ?? quarterlyRows[0];
    if (!objective) throw new Error("Plano trimestral exige objetivo para vincular ações");
    const { data, error } = await client
      .from("key_actions")
      .insert({
        org_id: session.org_id,
        objective_id: objective.id,
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

  return `Plano trimestral gravado com ${quarterlyRows.length} objetivo(s) e ${actionRows.length} ação(ões)-chave.`;
}

async function saveMonthlyPlan(client: Client, session: any, proposal: any, userId: string) {
  if (!session.area_id) throw new Error("Plano mensal exige uma área");
  const validationReasons = validateMonthlyProposal(proposal, session.period);
  if (validationReasons.length) {
    throw new Error(`Plano mensal incompleto ou inconsistente: ${validationReasons.join(", ")}`);
  }
  const alignment = proposal.quarterlyAlignment ?? proposal.alinhamento_trimestral ?? {};
  const quarterlyException = asText(alignment.status).toLowerCase() === "exception";
  const monthlyRows = [];
  const actionRows = [];

  for (const objective of asArray<any>(proposal.objectives ?? proposal.objetivos_mes)) {
    const parent = quarterlyException ? null : await findMonthlyQuarterlyParent(client, session, proposal, objective);
    const monthly = await insertObjective(client, {
      org_id: session.org_id,
      area_id: session.area_id,
      level: "monthly",
      type: asObjectiveType(objective.type),
      title: asText(objective.title, "Objetivo mensal"),
      result: asText(objective.result),
      metric: asText(objective.metric),
      target: asText(objective.target),
      current: asText(objective.current ?? objective.baseline ?? objective.valor_atual),
      deadline: cleanDate(objective.deadline ?? objective.prazo),
      owner: asText(objective.owner),
      evidence_plan: asText(objective.source ?? objective.fonte ?? objective.evidencePlan ?? objective.evidence_plan),
      status: "on_track",
      progress: 0,
      parent_id: parent?.id ?? null,
      period: asText(objective.period, session.period),
    });
    await applyProposedKpiLinks(client, session, monthly, objective, userId);
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
    .is("archived_at", null)
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

async function rollObjective(client: Client, session: any, source: any, nextPeriod: string, copyOpenActions = true) {
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
  if (copyOpenActions) await copyOpenActionsToObjective(client, session, source.id, rolled.id);
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
  const decisionItems = explicitPendencies.length ? explicitPendencies : reviewsWithDecision;

  for (const item of decisionItems) {
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
      const newObjective = await rollObjective(client, session, objective, nextPeriod, !action);
      targetObjectiveId = newObjective.id;
      rolledObjectiveIds.set(objective.id, targetObjectiveId);
      rolled += 1;
    }

    if (action) {
      const { error } = await client.from("key_actions").insert({
        org_id: session.org_id,
        objective_id: targetObjectiveId,
        description: `${asText(item.newScope ?? item.new_scope, action.description)} (rolado de ${session.period})`,
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
  const rawPulse = proposal.managementPulse ?? proposal.management_pulse ?? {};
  const confidenceValue = asText(rawPulse.confidence).toLowerCase();
  const confidence = ["green", "yellow", "red"].includes(confidenceValue) ? confidenceValue : "";
  const managementPulse = {
    confidence,
    confidenceReason: asText(rawPulse.confidenceReason ?? rawPulse.confidence_reason),
    blocker: asText(rawPulse.blocker ?? rawPulse.bloqueio),
    decisionNeeded: asText(rawPulse.decisionNeeded ?? rawPulse.decision_needed ?? rawPulse.decisao_necessaria),
    nextCommitment: asText(rawPulse.nextCommitment ?? rawPulse.next_commitment ?? rawPulse.proximo_compromisso),
  };
  const summary = [
    asText(proposal.summary, `Fechamento de ${session.period}`),
    `Conclusão informada: ${completionRate}%.`,
    confidence ? `Confiança no trimestre: ${confidence}.` : "",
    managementPulse.blocker ? `Trava: ${managementPulse.blocker}.` : "",
    managementPulse.decisionNeeded ? `Decisão necessária: ${managementPulse.decisionNeeded}.` : "",
    managementPulse.nextCommitment ? `Próximo compromisso: ${managementPulse.nextCommitment}.` : "",
    `Atualizados: ${reviewStats.updatedObjectives} objetivo(s), ${reviewStats.updatedActions} ação(ões), ${reviewStats.insertedEvidences} evidência(s).`,
    `Pendências: ${pendencyStats.rolled} rolada(s), ${pendencyStats.renegotiated} renegociada(s), ${pendencyStats.cut} cortada(s).`,
  ].filter(Boolean).join(" ");

  const { error } = await client.from("check_ins").insert({
    org_id: session.org_id,
    area_id: session.area_id,
    period: session.period,
    summary,
    details: {
      completionRate,
      managementPulse,
      reviewCount: reviewStats.updatedObjectives,
      evidenceCount: reviewStats.insertedEvidences,
      pendencies: pendencyStats,
    },
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
        .update({
          learning_focus: { ...(areaPlan.learning_focus ?? {}), [nextKey]: nextLearningFocus },
          updated_by: userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", areaPlan.id);
      if (updateError) throw updateError;
    }
  }

  return `Fechamento de ${session.period} gravado com ${reviewStats.updatedObjectives} objetivo(s) revisado(s) e ${pendencyStats.rolled} pendência(s) rolada(s) para ${nextPeriod}.`;
}

async function nextPlanDocumentVersion(client: Client, orgId: string, areaId: string | null, type: string, period: string) {
  let query = client
    .from("plan_documents")
    .select("version")
    .eq("org_id", orgId)
    .eq("type", type)
    .eq("period", period)
    .order("version", { ascending: false })
    .limit(1);
  query = areaId ? query.eq("area_id", areaId) : query.is("area_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return Number(data?.version ?? 0) + 1;
}

async function saveStrategicReview(client: Client, session: any, proposal: any, userId: string) {
  if (session.area_id) throw new Error("Revisão estratégica é do plano da empresa");

  const { data: strategicObjectives, error: objectivesError } = await client
    .from("objectives")
    .select("*")
    .eq("org_id", session.org_id)
    .is("area_id", null)
    .eq("level", "strategic")
    .is("archived_at", null)
    .order("created_at");
  if (objectivesError) throw objectivesError;
  if (!(strategicObjectives ?? []).length) throw new Error("Não há objetivos estratégicos para revisar");

  const objectivesById = new Map((strategicObjectives ?? []).map((objective: any) => [objective.id, objective]));
  const rawAdjustments = asArray<any>(proposal.adjustments ?? proposal.ajustes);
  if (!rawAdjustments.length) throw new Error("Revisão estratégica exige pelo menos um ajuste");

  const updatesByObjective = new Map<string, Record<string, unknown>>();
  const normalizedAdjustments = [];

  for (const adjustment of rawAdjustments) {
    const objectiveId = asText(adjustment.objectiveId ?? adjustment.objective_id ?? adjustment.objetivo_id);
    const objective = objectivesById.get(objectiveId);
    if (!objective) throw new Error("A revisão só pode ajustar objetivos estratégicos existentes desta empresa");

    const field = asStrategicReviewField(adjustment.field ?? adjustment.campo);
    if (!field) throw new Error("Campo inválido na revisão estratégica");

    const because = asText(adjustment.because ?? adjustment.porque ?? adjustment.justificativa);
    if (!because) throw new Error("Cada ajuste da revisão estratégica precisa de justificativa");

    let nextValue: string | null = asText(adjustment.to ?? adjustment.para ?? adjustment.valor);
    if (!nextValue) throw new Error("Cada ajuste precisa informar o novo valor");

    const update = updatesByObjective.get(objective.id) ?? {};
    if (field === "deadline") {
      const deadline = cleanDate(nextValue);
      if (!deadline) throw new Error("Prazo da revisão estratégica precisa estar em formato AAAA-MM-DD");
      update.deadline = deadline;
      nextValue = deadline;
    } else if (field === "status") {
      const status = asCloseStatus(nextValue);
      update.status = status;
      nextValue = status;
    } else {
      update[field] = nextValue;
    }
    updatesByObjective.set(objective.id, update);

    normalizedAdjustments.push({
      objetivo_id: objective.id,
      titulo: asText(objective.title),
      campo: field,
      de: strategicReviewValue(objective, field),
      para: nextValue,
      porque: because,
    });
  }

  const before = (strategicObjectives ?? []).map(snapshotStrategicObjective);
  for (const [objectiveId, update] of updatesByObjective.entries()) {
    const { error } = await client
      .from("objectives")
      .update(update)
      .eq("id", objectiveId)
      .eq("org_id", session.org_id)
      .is("area_id", null)
      .eq("level", "strategic");
    if (error) throw error;
  }

  const { data: updatedObjectives, error: updatedError } = await client
    .from("objectives")
    .select("*")
    .eq("org_id", session.org_id)
    .is("area_id", null)
    .eq("level", "strategic")
    .is("archived_at", null)
    .order("created_at");
  if (updatedError) throw updatedError;

  const { data: organization, error: organizationError } = await client
    .from("organizations")
    .select("name")
    .eq("id", session.org_id)
    .maybeSingle();
  if (organizationError) throw organizationError;

  const period = asText(proposal.period ?? proposal.periodo, session.period);
  const version = await nextPlanDocumentVersion(client, session.org_id, null, "strategic_review", period);
  const content = {
    empresa: asText(organization?.name, "Empresa"),
    area: null,
    tipo: "strategic_review",
    periodo: period,
    rastreabilidade: {
      schema_version: 1,
      origem: "proposta_confirmada",
      sessao_id: asText(session.id),
      tipo_sessao: "strategic_review",
    },
    motivo_revisao: asText(proposal.motivo_revisao ?? proposal.motivoRevisao ?? proposal.reason),
    ajustes: normalizedAdjustments,
    antes: before,
    depois: (updatedObjectives ?? []).map(snapshotStrategicObjective),
  };

  const { data: document, error: documentError } = await client
    .from("plan_documents")
    .insert({
      org_id: session.org_id,
      area_id: null,
      session_id: session.id,
      type: "strategic_review",
      origin: "session",
      period,
      title: `Revisão Estratégica ${period}`,
      content,
      version,
      created_by: userId,
    })
    .select("*")
    .single();
  if (documentError) throw documentError;

  return `Revisão estratégica gravada com ${normalizedAdjustments.length} ajuste(s). Documento gerado: ${document.title} (v${document.version}).`;
}

export async function applyProposal(client: Client, session: any, proposal: any, userId: string) {
  await assertProposalPermission(client, session, userId);
  const type = asText(proposal?.type);
  if (type === "save_monthly_plan") proposal = normalizeMonthlyContinuity(proposal);
  let summary = "";
  if (type === "save_strategic_plan") summary = await saveStrategicPlan(client, session, proposal, userId);
  else if (type === "save_quarterly_plan") summary = await saveQuarterlyPlan(client, session, proposal, userId);
  else if (type === "save_monthly_plan") summary = await saveMonthlyPlan(client, session, proposal, userId);
  else if (type === "month_close") summary = await saveMonthClose(client, session, proposal, userId);
  else if (type === "quarter_close") summary = await saveQuarterClose(client, session, proposal, userId);
  else if (type === "apply_strategic_review") summary = await saveStrategicReview(client, session, proposal, userId);
  else throw new Error("Proposta não reconhecida para gravação");

  const document = await createDocumentForProposal(client, session, proposal, userId);
  if (document) {
    return `${summary} Documento padrão gerado: ${document.title} (v${document.version}).`;
  }
  return summary;
}
