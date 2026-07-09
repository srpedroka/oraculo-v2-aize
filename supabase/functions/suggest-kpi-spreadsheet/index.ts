import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertOrgMember, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { suggestKpiSpreadsheet, type KpiSpreadsheetDefinition } from "../_shared/kpi-spreadsheet.ts";

const MAX_TEXT_LENGTH = 80_000;
const MAX_FILENAME_LENGTH = 180;

function asText(value: unknown, maxLength = 10_000) {
  return String(value ?? "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").trim().slice(0, maxLength);
}

function mapDefinition(row: any): KpiSpreadsheetDefinition {
  return {
    key: row.kpi_key,
    label: row.label,
    unit: row.unit,
    secondaryUnit: row.secondary_unit,
    isLadder: Boolean(row.is_ladder),
    ladder: Array.isArray(row.ladder) ? row.ladder : [],
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const user = await getUser(req);
    const payload = await req.json();
    const orgId = asText(payload.orgId, 80);
    const rawText = asText(payload.rawText, MAX_TEXT_LENGTH);
    const fileName = asText(payload.fileName, MAX_FILENAME_LENGTH) || null;

    if (!orgId) throw new Error("Empresa ausente");
    if (!rawText) throw new Error("Selecione uma planilha com dados de Meta e Atingido.");

    const client = serviceClient();
    const membership = await assertOrgMember(user.id, orgId);
    if (membership.role !== "owner" && membership.role !== "admin") throw new Error("Apenas owner ou admin pode importar lançamentos de KPI.");

    const { data, error } = await client
      .from("executive_kpis")
      .select("kpi_key, label, unit, secondary_unit, is_ladder, ladder")
      .eq("org_id", orgId)
      .order("sort_order");
    if (error) throw error;
    const definitions = (data ?? []).map(mapDefinition);
    if (!definitions.length) throw new Error("Os KPIs executivos desta empresa ainda não estão disponíveis.");

    const suggestion = await suggestKpiSpreadsheet(client, { orgId, rawText, fileName, definitions });
    return jsonResponse({ suggestion });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Não foi possível interpretar a planilha" }, 400);
  }
});
