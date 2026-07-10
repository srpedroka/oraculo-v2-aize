import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertAreaWriter, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type PlanDocumentType = "strategic" | "quarterly" | "monthly" | "month_close" | "quarter_close";

const DOCUMENT_TYPES = new Set<PlanDocumentType>(["strategic", "quarterly", "monthly", "month_close", "quarter_close"]);
const TYPE_LABEL: Record<PlanDocumentType, string> = {
  strategic: "Plano Estratégico",
  quarterly: "Plano Trimestral",
  monthly: "Plano Mensal",
  month_close: "Fechamento Mensal",
  quarter_close: "Fechamento Trimestral",
};
const MAX_TEXT_LENGTH = 200_000;
const MAX_NOTE_LENGTH = 1_000;
const MAX_SOURCE_LENGTH = 180;
const MAX_PERIOD_LENGTH = 80;
const MAX_LOW_CONFIDENCE_FIELDS = 8;

function asText(value: unknown) {
  return String(value ?? "").trim();
}

function optionalText(value: unknown, maxLength: number) {
  const text = asText(value);
  return text ? text.slice(0, maxLength) : null;
}

function optionalNumber(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(1, parsed));
}

function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function normalizeOverridden(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return {
    documentType: Boolean(record.documentType),
    areaId: Boolean(record.areaId),
    period: Boolean(record.period),
    title: Boolean(record.title),
  };
}

function normalizeConfirmed(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return {
    documentType: optionalText(record.documentType, 30),
    areaId: optionalText(record.areaId, 80),
    period: optionalText(record.period, MAX_PERIOD_LENGTH),
    title: optionalText(record.title, 120),
  };
}

function normalizeClassification(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const lowConfidenceFields = Array.isArray(record.lowConfidenceFields)
    ? record.lowConfidenceFields
        .map((item) => optionalText(item, 40))
        .filter((item): item is string => Boolean(item))
        .slice(0, MAX_LOW_CONFIDENCE_FIELDS)
    : [];

  return {
    documentType: optionalText(record.documentType, 30),
    areaId: optionalText(record.areaId, 80),
    areaName: optionalText(record.areaName, 120),
    period: optionalText(record.period, MAX_PERIOD_LENGTH),
    periodFound: optionalBoolean(record.periodFound),
    title: optionalText(record.title, 120),
    summary: optionalText(record.summary, 320),
    confidence: optionalNumber(record.confidence),
    lowConfidenceFields,
    source: optionalText(record.source, 40),
    confirmed: normalizeConfirmed(record.confirmed),
    overridden: normalizeOverridden(record.overridden),
  };
}

function normalizeRawText(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

async function loadArea(client: any, orgId: string, areaId: string | null) {
  if (!areaId) return null;
  const { data, error } = await client
    .from("areas")
    .select("id, name")
    .eq("id", areaId)
    .eq("org_id", orgId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Área inválida para esta empresa");
  return data as { id: string; name: string };
}

async function nextHistoricalVersion(client: any, orgId: string, areaId: string | null, documentType: PlanDocumentType, period: string) {
  let query = client
    .from("plan_documents")
    .select("version")
    .eq("org_id", orgId)
    .eq("origin", "historical")
    .eq("type", documentType)
    .eq("period", period)
    .order("version", { ascending: false })
    .limit(1);

  query = areaId ? query.eq("area_id", areaId) : query.is("area_id", null);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return Number(data?.version ?? 0) + 1;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const user = await getUser(req);
    const payload = await req.json();
    const orgId = asText(payload.orgId);
    const areaId = payload.areaId ? asText(payload.areaId) : null;
    const documentType = asText(payload.documentType) as PlanDocumentType;
    const period = asText(payload.period);
    const rawText = normalizeRawText(payload.rawText);
    const source = optionalText(payload.source, MAX_SOURCE_LENGTH);
    const note = optionalText(payload.note, MAX_NOTE_LENGTH);
    const requestedTitle = optionalText(payload.title, 120);
    const classification = normalizeClassification(payload.classification);

    if (!orgId) throw new Error("Empresa ausente");
    if (!DOCUMENT_TYPES.has(documentType)) throw new Error("Tipo de documento inválido");
    if (!period) throw new Error("Informe o ano ou período do histórico");
    if (period.length > MAX_PERIOD_LENGTH) throw new Error("Período muito longo");
    if (!rawText) throw new Error("Informe o texto do histórico");
    if (rawText.length > MAX_TEXT_LENGTH) throw new Error("Texto muito longo. Divida o histórico em arquivos menores.");

    const client = serviceClient();
    const membership = await assertAreaWriter(user.id, orgId, areaId);
    if (membership.role === "admin") throw new Error("Admin não pode importar histórico");

    const [{ data: organization, error: orgError }, profileResult, area] = await Promise.all([
      client.from("organizations").select("name").eq("id", orgId).maybeSingle(),
      client.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
      loadArea(client, orgId, areaId),
    ]);
    if (orgError) throw orgError;
    if (!organization) throw new Error("Empresa inválida");
    if (profileResult.error) throw profileResult.error;

    const version = await nextHistoricalVersion(client, orgId, areaId, documentType, period);
    const areaLabel = area?.name ? ` · ${area.name}` : "";
    const title = requestedTitle ?? `${TYPE_LABEL[documentType]} histórico${areaLabel} · ${period}`;
    const importedAt = new Date().toISOString();
    const content = {
      empresa: organization.name ?? "Empresa",
      area: area?.name ?? null,
      periodo: period,
      gestor: profileResult.data?.full_name ?? profileResult.data?.email ?? "",
      raw: rawText,
      source,
      note,
      classification,
      imported_at: importedAt,
    };

    const { data, error } = await client
      .from("plan_documents")
      .insert({
        org_id: orgId,
        area_id: areaId,
        session_id: null,
        type: documentType,
        origin: "historical",
        period,
        title,
        content,
        version,
        created_by: user.id,
      })
      .select("*")
      .single();
    if (error) throw error;

    return jsonResponse({ document: data });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Não foi possível salvar o histórico" }, 400);
  }
});
