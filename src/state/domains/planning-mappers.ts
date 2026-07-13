import type { AreaPlan, Evidence, KeyAction, Objective, StrategicPlan, StrategicProject } from "../../types";
import { mapOperationalLifecycle } from "./shared";

export function mapProject(row: any): StrategicProject {
  return {
    id: row.id, orgId: row.org_id, planId: row.plan_id ?? null, name: row.name, owner: row.owner ?? "",
    ownerMembershipId: row.owner_membership_id ?? null, deadline: row.deadline ?? null, status: row.status ?? "on_track",
    linkedObjectiveId: row.linked_objective_id ?? null, ...mapOperationalLifecycle(row),
  };
}

export function mapStrategicPlan(row: any, projects: StrategicProject[]): StrategicPlan {
  return {
    id: row.id,
    orgId: row.org_id,
    year: row.year,
    profile: {
      sector: row.profile?.sector ?? "", size: row.profile?.size ?? "", region: row.profile?.region ?? "",
      founded: row.profile?.founded ?? "", mainPain: row.profile?.mainPain ?? row.profile?.main_pain ?? "",
    },
    drivers: { purpose: row.drivers?.purpose ?? "", vision: row.drivers?.vision ?? "", values: Array.isArray(row.drivers?.values) ? row.drivers.values : [] },
    swot: {
      strengths: Array.isArray(row.swot?.strengths) ? row.swot.strengths : [],
      weaknesses: Array.isArray(row.swot?.weaknesses) ? row.swot.weaknesses : [],
      opportunities: Array.isArray(row.swot?.opportunities) ? row.swot.opportunities : [],
      threats: Array.isArray(row.swot?.threats) ? row.swot.threats : [],
    },
    themes: row.themes ?? [], projects, rituals: row.rituals ?? [], executiveSummary: row.executive_summary ?? "",
  };
}

export function mapAreaPlan(row: any): AreaPlan {
  return {
    id: row.id, areaId: row.area_id, year: row.year,
    role: { mission: row.role?.mission ?? "", contribution: Array.isArray(row.role?.contribution) ? row.role.contribution : [] },
    linkedStrategicObjectiveIds: row.linked_strategic_objective_ids ?? [],
    diagnosis: {
      strengths: Array.isArray(row.diagnosis?.strengths) ? row.diagnosis.strengths : [],
      weaknesses: Array.isArray(row.diagnosis?.weaknesses) ? row.diagnosis.weaknesses : [],
    },
    mainAnnualObjectiveId: row.main_annual_objective_id ?? null,
    learningFocus: {
      q1: Array.isArray(row.learning_focus?.q1) ? row.learning_focus.q1 : [],
      q2: Array.isArray(row.learning_focus?.q2) ? row.learning_focus.q2 : [],
      q3: Array.isArray(row.learning_focus?.q3) ? row.learning_focus.q3 : [],
      q4: Array.isArray(row.learning_focus?.q4) ? row.learning_focus.q4 : [],
    },
  };
}

export function mapObjective(row: any): Objective {
  return {
    id: row.id, orgId: row.org_id, areaId: row.area_id ?? null, level: row.level, type: row.type, title: row.title,
    result: row.result ?? "", metric: row.metric ?? undefined, target: row.target ?? undefined, current: row.current ?? undefined,
    trend: row.trend ?? undefined, deadline: row.deadline ?? null, owner: row.owner ?? "", ownerMembershipId: row.owner_membership_id ?? null,
    evidencePlan: row.evidence_plan ?? "", status: row.status, progress: row.progress ?? 0, deliverables: row.deliverables ?? [],
    parentId: row.parent_id ?? null, period: row.period, ...mapOperationalLifecycle(row),
  };
}

export function mapKeyAction(row: any): KeyAction {
  return {
    id: row.id, orgId: row.org_id, objectiveId: row.objective_id, description: row.description,
    completionCriterion: row.completion_criterion ?? "", deadline: row.deadline ?? null, owner: row.owner ?? "",
    ownerMembershipId: row.owner_membership_id ?? null, status: row.status ?? "on_track", ...mapOperationalLifecycle(row),
  };
}

export function mapEvidence(row: any): Evidence {
  return {
    id: row.id, orgId: row.org_id, objectiveId: row.objective_id, text: row.text, date: row.created_at,
    createdBy: row.created_by ?? null, ...mapOperationalLifecycle(row),
  };
}

export function toObjectiveInsert(objective: Objective, orgId: string) {
  return {
    id: objective.id.startsWith("draft") ? undefined : objective.id, org_id: orgId, area_id: objective.areaId,
    level: objective.level, type: objective.type, title: objective.title, result: objective.result, metric: objective.metric ?? null,
    target: objective.target ?? null, current: objective.current ?? null, trend: objective.trend ?? null, deadline: objective.deadline,
    owner: objective.owner, owner_membership_id: objective.ownerMembershipId ?? null, evidence_plan: objective.evidencePlan,
    status: objective.status, progress: objective.progress ?? 0, deliverables: objective.deliverables ?? [], parent_id: objective.parentId, period: objective.period,
  };
}

export function toKeyActionInsert(keyAction: KeyAction, orgId: string) {
  return {
    id: keyAction.id, org_id: orgId, objective_id: keyAction.objectiveId, description: keyAction.description,
    completion_criterion: keyAction.completionCriterion, deadline: keyAction.deadline, owner: keyAction.owner,
    owner_membership_id: keyAction.ownerMembershipId ?? null, status: keyAction.status ?? "on_track",
  };
}
