import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertOrgMember, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  suggestKpiSpreadsheet,
  type KpiImportImage,
  type KpiImportKind,
  type KpiSpreadsheetDefinition,
  type KpiSpreadsheetSuggestion,
} from "../_shared/kpi-spreadsheet.ts";

const MAX_TEXT_LENGTH = 80_000;
const MAX_FILENAME_LENGTH = 180;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8;
const MAX_HISTORY_DOCS = 30;
const MAX_CHARS_PER_DOC = 12_000;

function asText(value: unknown, maxLength = 10_000) {
  return String(value ?? "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").trim().slice(0, maxLength);
}

function mapDefinition(row: any): KpiSpreadsheetDefinition & { id?: string } {
  return {
    key: row.kpi_key,
    label: row.label,
    unit: row.unit,
    secondaryUnit: row.secondary_unit,
    isLadder: Boolean(row.is_ladder),
    ladder: Array.isArray(row.ladder) ? row.ladder : [],
    id: row.id,
  };
}

function normalizeImage(value: unknown): KpiImportImage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const mimeType = asText(record.mimeType, 40);
  const base64 = asText(record.base64, MAX_IMAGE_BASE64_LENGTH).replace(/\s/g, "");
  if ((mimeType !== "image/jpeg" && mimeType !== "image/png") || !base64) return null;
  if (base64.length > MAX_IMAGE_BASE64_LENGTH || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  return { mimeType, base64 };
}

function documentBody(content: unknown) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return "";
  const record = content as Record<string, unknown>;
  return asText(record.raw ?? record.extractedText ?? record.normalizedText ?? record.summary ?? "", MAX_CHARS_PER_DOC);
}

async function loadHistoryCorpus(client: ReturnType<typeof serviceClient>, orgId: string) {
  const { data, error } = await client
    .from("plan_documents")
    .select("id, title, period, type, content, created_at")
    .eq("org_id", orgId)
    .eq("origin", "historical")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_DOCS);
  if (error) throw error;

  const docs = (data ?? [])
    .map((row: any) => {
      const body = documentBody(row.content);
      if (!body) return null;
      return {
        id: row.id as string,
        title: asText(row.title, 180) || "Documento histórico",
        period: asText(row.period, 80) || null,
        type: asText(row.type, 40) || null,
        excerptChars: body.length,
        text: `### ${asText(row.title, 180) || "Documento"} (${asText(row.period, 40) || "sem período"} · ${asText(row.type, 40) || "histórico"})\n${body}`,
      };
    })
    .filter(Boolean) as Array<{ id: string; title: string; period: string | null; type: string | null; excerptChars: number; text: string }>;

  let rawText = "";
  const used: typeof docs = [];
  for (const doc of docs) {
    if (rawText.length >= MAX_TEXT_LENGTH) break;
    const next = rawText ? `${rawText}\n\n${doc.text}` : doc.text;
    if (next.length > MAX_TEXT_LENGTH) {
      const remaining = MAX_TEXT_LENGTH - rawText.length - 20;
      if (remaining > 500) {
        rawText = `${rawText}\n\n${doc.text.slice(0, remaining)}\n[...documento truncado...]`;
        used.push(doc);
      }
      break;
    }
    rawText = next;
    used.push(doc);
  }

  return {
    rawText,
    documents: used.map(({ id, title, period, type, excerptChars }) => ({ id, title, period, type, excerptChars })),
  };
}

function filterOnlyGaps(
  suggestion: KpiSpreadsheetSuggestion,
  definitions: Array<KpiSpreadsheetDefinition & { id?: string }>,
  existing: Array<{ kpi_id: string; year: number; month: number; actual_value: number | null; target_value: number | null; target_stage: string | null }>,
): KpiSpreadsheetSuggestion {
  const byKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const filled = new Set(
    existing
      .filter((row) => row.actual_value != null || row.target_value != null || row.target_stage)
      .map((row) => `${row.kpi_id}:${row.year}:${row.month}`),
  );

  const rows = suggestion.rows.filter((row) => {
    const definition = byKey.get(row.kpiKey);
    if (!definition?.id) return true;
    // Mantém só o que ainda não tem Meta nem Atingido no banco.
    return !filled.has(`${definition.id}:${row.year}:${row.month}`);
  });

  const skipped = suggestion.rows.length - rows.length;
  return {
    ...suggestion,
    rows,
    warnings: [
      ...suggestion.warnings,
      ...(skipped > 0
        ? [`${skipped} lançamento(s) já existiam no Dashboard e foram omitidos (só resgatamos lacunas).`]
        : []),
    ],
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const user = await getUser(req);
    const payload = await req.json();
    const orgId = asText(payload.orgId, 80);
    const fromHistory = Boolean(payload.fromHistory);
    const onlyGaps = payload.onlyGaps !== false;
    let inputKind = payload.inputKind === "image" ? "image" : "spreadsheet" as KpiImportKind;
    let rawText = asText(payload.rawText, MAX_TEXT_LENGTH);
    let image = normalizeImage(payload.image);
    let fileName = asText(payload.fileName, MAX_FILENAME_LENGTH) || null;
    let historyDocuments: Array<{ id: string; title: string; period: string | null; type: string | null; excerptChars: number }> = [];

    if (!orgId) throw new Error("Empresa ausente");

    const client = serviceClient();
    const membership = await assertOrgMember(user.id, orgId);
    if (membership.role !== "owner" && membership.role !== "admin") {
      throw new Error("Apenas owner ou admin pode importar lançamentos de KPI.");
    }

    if (fromHistory) {
      const corpus = await loadHistoryCorpus(client, orgId);
      if (!corpus.rawText) {
        throw new Error("Não há documentos históricos com texto para analisar. Importe históricos em Plano Estratégico primeiro.");
      }
      rawText = corpus.rawText;
      image = null;
      inputKind = "spreadsheet";
      fileName = "Históricos da empresa";
      historyDocuments = corpus.documents;
    }

    if (inputKind === "image" && !image) throw new Error("Envie uma imagem JPG, PNG ou WEBP de até 8 MB.");
    if (inputKind === "spreadsheet" && !rawText) throw new Error("Selecione uma planilha com dados de Meta e Atingido.");

    const { data, error } = await client
      .from("executive_kpis")
      .select("id, kpi_key, label, unit, secondary_unit, is_ladder, ladder")
      .eq("org_id", orgId)
      .order("sort_order");
    if (error) throw error;
    const definitions = (data ?? []).map(mapDefinition);
    if (!definitions.length) throw new Error("Os KPIs executivos desta empresa ainda não estão disponíveis.");

    let suggestion = await suggestKpiSpreadsheet(client, {
      orgId,
      inputKind: fromHistory ? "history" : inputKind,
      rawText,
      image,
      fileName,
      definitions,
    });

    if (fromHistory && onlyGaps) {
      const { data: existing, error: existingError } = await client
        .from("kpi_monthly_values")
        .select("kpi_id, year, month, actual_value, target_value, target_stage")
        .eq("org_id", orgId)
        .in(
          "kpi_id",
          definitions.map((definition) => definition.id).filter(Boolean) as string[],
        );
      if (existingError) throw existingError;
      suggestion = filterOnlyGaps(suggestion, definitions, existing ?? []);
    }

    if (fromHistory && !suggestion.rows.length) {
      suggestion = {
        ...suggestion,
        warnings: [
          ...suggestion.warnings,
          historyDocuments.length
            ? "Li os históricos, mas não encontrei lançamentos novos de KPI (ou tudo já está no Dashboard)."
            : "Nenhum histórico com texto útil.",
        ],
      };
    }

    return jsonResponse({
      suggestion,
      historyDocuments: fromHistory ? historyDocuments : undefined,
      fromHistory: fromHistory || undefined,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Não foi possível interpretar a planilha" }, 400);
  }
});