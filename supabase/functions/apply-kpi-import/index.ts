import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertOrgMember, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  sanitizeKpiSuggestion,
  type KpiImportKind,
  type KpiSpreadsheetDefinition,
  type KpiSpreadsheetSuggestion,
  type KpiSpreadsheetSuggestionRow,
} from "../_shared/kpi-spreadsheet.ts";
import { runIdempotentCommand } from "../_shared/tx-runner.ts";
import { kpiImportCommandKey } from "../_shared/tx-client.ts";

const MAX_FILENAME_LENGTH = 180;
const KPI_MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

interface KpiDefinition extends KpiSpreadsheetDefinition {
  id: string;
}

interface AppliedKpiRow extends KpiSpreadsheetSuggestionRow {
  kpiId: string;
  label: string;
  unit: "currency" | "percent" | "count";
  targetStageLabel: string | null;
}

function asText(value: unknown, maxLength = 10_000) {
  return String(value ?? "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").trim().slice(0, maxLength);
}

function inputKind(value: unknown): KpiImportKind {
  if (value === "image") return "image";
  if (value === "history") return "history";
  return "spreadsheet";
}

function mapDefinition(row: any): KpiDefinition {
  return {
    id: row.id,
    key: row.kpi_key,
    label: row.label,
    unit: row.unit,
    secondaryUnit: row.secondary_unit,
    isLadder: Boolean(row.is_ladder),
    ladder: Array.isArray(row.ladder) ? row.ladder : [],
  };
}

function displayValue(value: number | null, unit: KpiDefinition["unit"]) {
  if (value === null || value === undefined) return "—";
  if (unit === "percent") return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
  if (unit === "currency") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);
}

function historyPeriod(rows: AppliedKpiRow[]) {
  const years = [...new Set(rows.map((row) => row.year))].sort((left, right) => left - right);
  if (years.length === 1) return String(years[0]);
  if (years.length > 1 && years.every((year, index) => index === 0 || year === years[index - 1] + 1)) return `${years[0]}–${years[years.length - 1]}`;
  return years.join(", ");
}

function historyRaw(rows: AppliedKpiRow[], fileName: string, kind: KpiImportKind) {
  const source = kind === "image" ? "imagem" : kind === "history" ? "históricos da empresa" : "planilha";
  const lines = rows.map((row) => {
    const target = row.targetStageLabel ?? displayValue(row.targetValue, row.unit);
    return `${KPI_MONTHS[row.month - 1]} ${row.year} · ${row.label} · Meta: ${target} · Atingido: ${displayValue(row.actualValue, row.unit)}`;
  });
  return [`Importação confirmada de ${source}: ${fileName}.`, "", ...lines].join("\n");
}

async function nextHistoryVersion(client: any, orgId: string, period: string) {
  const { data, error } = await client
    .from("plan_documents")
    .select("version")
    .eq("org_id", orgId)
    .eq("origin", "historical")
    .eq("type", "kpi_history")
    .eq("period", period)
    .is("area_id", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.version ?? 0) + 1;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const user = await getUser(req);
    const payload = await req.json();
    const orgId = asText(payload.orgId, 80);
    const fileName = asText(payload.fileName, MAX_FILENAME_LENGTH) || "Arquivo importado";
    const kind = inputKind(payload.inputKind);
    if (!orgId) throw new Error("Empresa ausente");

    const client = serviceClient();
    const membership = await assertOrgMember(user.id, orgId);
    if (membership.role !== "owner" && membership.role !== "admin") throw new Error("Apenas owner ou admin pode aplicar lançamentos de KPI.");

    const { data: kpiRows, error: kpiError } = await client
      .from("executive_kpis")
      .select("id, kpi_key, label, unit, secondary_unit, is_ladder, ladder")
      .eq("org_id", orgId)
      .order("sort_order");
    if (kpiError) throw kpiError;
    const definitions = (kpiRows ?? []).map(mapDefinition);
    if (!definitions.length) throw new Error("Os KPIs executivos desta empresa ainda não estão disponíveis.");

    const suggestion = sanitizeKpiSuggestion(payload.suggestion, definitions);
    if (!suggestion.rows.length) throw new Error("A proposta não contém lançamentos de KPI válidos.");

    const kpisByKey = new Map(definitions.map((definition) => [definition.key, definition]));

    // Idempotencia por ACAO: o cliente envia um "numero de recibo" (applyToken) por
    // importacao. Duplo clique/retry da MESMA acao => mesmo token => idempotente (nao
    // duplica); uma reimportacao deliberada => token novo => reaplica (corrige valores).
    // Sem token (chamada direta/legado): gera um token unico por requisicao => sempre
    // aplica, nunca reporta sucesso falso. O conteudo cru {rows,year,fileName,kind} vai
    // em request_hash so para barrar "mesmo token, conteudo diferente".
    const applyToken = asText(payload.applyToken, 100) || crypto.randomUUID();
    const rawSuggestion = (payload.suggestion ?? {}) as { rows?: unknown; year?: unknown; ano?: unknown };
    const key = await kpiImportCommandKey(orgId, applyToken, { rows: rawSuggestion.rows ?? [], year: rawSuggestion.year ?? rawSuggestion.ano ?? null, fileName, kind }, user.id);

    // Numeros (kpi_monthly_values) + documento (kpi_history) gravados numa UNICA
    // transacao. Se o documento falhar, os numeros nao mudam (tudo-ou-nada).
    const outcome = await runIdempotentCommand(key, async (tx) => {
      const { data: existingValues, error: existingError } = await tx
        .from("kpi_monthly_values")
        .select("kpi_id, year, month, target_value, target_stage, actual_value, secondary_actual, note")
        .eq("org_id", orgId)
        .in("kpi_id", definitions.map((definition) => definition.id));
      if (existingError) throw existingError;
      const existingByPeriod = new Map((existingValues ?? []).map((value: any) => [`${value.kpi_id}:${value.year}:${value.month}`, value]));

      const now = new Date().toISOString();
      const appliedRows: AppliedKpiRow[] = [];
      const rowsToUpsert = suggestion.rows.flatMap((suggested) => {
        const definition = kpisByKey.get(suggested.kpiKey);
        if (!definition) return [];
        const existing = existingByPeriod.get(`${definition.id}:${suggested.year}:${suggested.month}`);
        const targetStage = suggested.targetStage ?? existing?.target_stage ?? null;
        const targetStageLabel = targetStage ? definition.ladder.find((stage) => stage.key === targetStage)?.label ?? targetStage : null;
        appliedRows.push({
          ...suggested,
          targetValue: suggested.targetValue ?? existing?.target_value ?? null,
          targetStage,
          actualValue: suggested.actualValue ?? existing?.actual_value ?? null,
          secondaryActual: suggested.secondaryActual ?? existing?.secondary_actual ?? null,
          note: suggested.note ?? existing?.note ?? null,
          kpiId: definition.id,
          label: definition.label,
          unit: definition.unit,
          targetStageLabel,
        });
        return [{
          org_id: orgId,
          kpi_id: definition.id,
          year: suggested.year,
          month: suggested.month,
          target_value: suggested.targetValue ?? existing?.target_value ?? null,
          target_stage: targetStage,
          actual_value: suggested.actualValue ?? existing?.actual_value ?? null,
          secondary_actual: suggested.secondaryActual ?? existing?.secondary_actual ?? null,
          note: suggested.note ?? existing?.note ?? null,
          updated_by: user.id,
          updated_at: now,
        }];
      });
      if (!rowsToUpsert.length) throw new Error("A proposta não contém indicadores válidos desta empresa.");

      const { error: upsertError } = await tx.from("kpi_monthly_values").upsert(rowsToUpsert, { onConflict: "kpi_id,year,month" });
      if (upsertError) throw upsertError;

      const period = historyPeriod(appliedRows);
      const [{ data: organization, error: organizationError }, profileResult, version] = await Promise.all([
        tx.from("organizations").select("name").eq("id", orgId).maybeSingle(),
        tx.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
        nextHistoryVersion(tx, orgId, period),
      ]);
      if (organizationError) throw organizationError;
      if (!organization) throw new Error("Empresa inválida");
      if (profileResult.error) throw profileResult.error;

      const historyContent = {
        tipo: "kpi_history",
        empresa: organization.name ?? "Empresa",
        area: null,
        periodo: period,
        gestor: profileResult.data?.full_name ?? profileResult.data?.email ?? "",
        source: fileName,
        note: [suggestion.summary, ...suggestion.warnings].filter(Boolean).join(" "),
        import_kind: kind,
        summary: suggestion.summary,
        warnings: suggestion.warnings,
        imported_at: now,
        kpis: appliedRows.map(({ kpiId: _kpiId, ...row }) => row),
        raw: historyRaw(appliedRows, fileName, kind),
      };
      const { data: document, error: documentError } = await tx
        .from("plan_documents")
        .insert({
          org_id: orgId,
          area_id: null,
          session_id: null,
          type: "kpi_history",
          origin: "historical",
          period,
          title: `Histórico de KPIs · ${period}`,
          content: historyContent,
          version,
          created_by: user.id,
        })
        .select("*")
        .single();
      if (documentError) throw documentError;

      return { result: { appliedCount: rowsToUpsert.length, document } };
    });

    return jsonResponse(outcome.result);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Não foi possível aplicar a importação de KPI" }, 400);
  }
});
