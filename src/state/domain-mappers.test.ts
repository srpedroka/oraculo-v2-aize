import { describe, expect, it } from "vitest";
import { mapArea, mapMembership, mapOrganization, mapProfile } from "./domains/organization-mappers";
import { mapObjective, toObjectiveInsert } from "./domains/planning-mappers";
import { mapPlanDocument } from "./domains/session-mappers";
import { mapExecutiveKpi, mapKpiMonthlyValue } from "./domains/kpi-mappers";
import { mapAiSettings, mapOrgTone, mapWhatsAppSettings } from "./domains/settings-mappers";

describe("domain mappers", () => {
  it("preserva organização, pessoa, membership e coordenação da área", () => {
    const profile = mapProfile({ id: "u1", full_name: "Ana", email: "ana@empresa.com", phone: "5511999999999" });
    const membership = mapMembership({ id: "m1", org_id: "o1", user_id: "u1", role: "coordinator" }, [profile]);
    expect(mapOrganization({ id: "o1", name: "Empresa", archived_at: null })).toMatchObject({ id: "o1", name: "Empresa", archivedAt: null });
    expect(mapArea({ id: "a1", org_id: "o1", name: "Comercial", coordinator_id: "m1" }, [membership])).toMatchObject({ coordinator: "Ana", coordinatorId: "m1" });
  });

  it("mantém lifecycle e contrato de escrita do objetivo", () => {
    const objective = mapObjective({
      id: "obj1", org_id: "o1", area_id: null, level: "strategic", type: "result", title: "Crescer",
      status: "on_track", period: "2026", archived_at: "2026-01-01T00:00:00Z",
    });
    expect(objective.archivedAt).toBe("2026-01-01T00:00:00Z");
    expect(toObjectiveInsert({ ...objective, id: "draft-new" }, "o1")).toMatchObject({ id: undefined, org_id: "o1", title: "Crescer" });
  });

  it("preserva documentos, KPIs e configurações sem expor segredos", () => {
    expect(mapPlanDocument({ id: "d1", org_id: "o1", type: "strategic", period: "2026", title: "Plano", version: 2, created_at: "now" })).toMatchObject({ version: 2, origin: "session" });
    expect(mapExecutiveKpi({ id: "k1", org_id: "o1", kpi_key: "revenue", label: "Receita", unit: "currency", ladder: [], annual_target: "1000", created_at: "now" })).toMatchObject({ annualTarget: 1000 });
    expect(mapKpiMonthlyValue({ id: "v1", org_id: "o1", kpi_id: "k1", year: 2026, month: 1, actual_value: "10", updated_at: "now" })).toMatchObject({ actualValue: 10 });
    expect(mapAiSettings({ org_id: "o1", provider: "openai", model: "gpt", has_key: true, key_preview: "sk-..." })).toMatchObject({ hasKey: true, keyPreview: "sk-..." });
    expect(mapOrgTone({ org_id: "o1", preset: "equilibrado" })).toMatchObject({ acidity: 0, drive: 0 });
    expect(mapWhatsAppSettings({ org_id: "o1", enabled: true, has_api_key: true })).toMatchObject({ enabled: true, hasApiKey: true });
  });
});
