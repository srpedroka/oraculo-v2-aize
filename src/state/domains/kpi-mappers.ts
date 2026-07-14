import type { ExecutiveKpi, KpiMonthlyValue, LadderStage, ObjectiveKpiLink } from "../../types";
import { nullableNumber } from "./shared";

function mapLadderStage(item: any): LadderStage | null {
  if (!item || typeof item !== "object") return null;
  const key = typeof item.key === "string" ? item.key : "";
  const label = typeof item.label === "string" ? item.label : key;
  const order = Number(item.order ?? 0);
  return key ? { key, label, order: Number.isFinite(order) ? order : 0 } : null;
}

export function mapExecutiveKpi(row: any): ExecutiveKpi {
  return {
    id: row.id, orgId: row.org_id, key: row.kpi_key, label: row.label, unit: row.unit, secondaryUnit: row.secondary_unit ?? null,
    direction: row.direction ?? "higher_better", flowType: row.flow_type ?? "flow", isLadder: row.is_ladder ?? false,
    ladder: Array.isArray(row.ladder) ? row.ladder.map(mapLadderStage).filter(Boolean) as LadderStage[] : [],
    openingBalance: nullableNumber(row.opening_balance), annualTarget: nullableNumber(row.annual_target),
    sortOrder: Number(row.sort_order ?? 0), createdAt: row.created_at, updatedAt: row.updated_at ?? row.created_at,
    updatedBy: row.updated_by ?? null,
  };
}

export function mapKpiMonthlyValue(row: any): KpiMonthlyValue {
  return {
    id: row.id, orgId: row.org_id, kpiId: row.kpi_id, year: Number(row.year), month: Number(row.month),
    targetValue: nullableNumber(row.target_value), targetStage: row.target_stage ?? null, actualValue: nullableNumber(row.actual_value),
    secondaryActual: nullableNumber(row.secondary_actual), note: row.note ?? null, updatedBy: row.updated_by ?? null, updatedAt: row.updated_at,
  };
}

export function mapObjectiveKpiLink(row: any): ObjectiveKpiLink {
  return {
    id: row.id, orgId: row.org_id, objectiveId: row.objective_id, kpiId: row.kpi_id, rationale: row.rationale ?? "",
    confidence: Number(row.confidence ?? 0), createdBy: row.created_by ?? null, createdAt: row.created_at,
  };
}
