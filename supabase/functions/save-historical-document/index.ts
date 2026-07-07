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

function asText(value: unknown) {
  return String(value ?? "").trim();
}

function optionalText(value: unknown, maxLength: number) {
  const text = asText(value);
  return text ? text.slice(0, maxLength) : null;
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
  const { data, error } = await client.from("areas").select("id, name").eq("id", areaId).eq("org_id", orgId).maybeSingle();
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

    if (!orgId) throw new Error("Empresa ausente");
    if (!DOCUMENT_TYPES.has(documentType)) throw new Error("Tipo de documento inválido");
    if (!period) throw new Error("Informe o ano ou período do histórico");
    if (period.length > MAX_PERIOD_LENGTH) throw new Error("Período muito longo");
    if (!rawText) throw new Error("Informe o texto do histórico");
    if (rawText.length > MAX_TEXT_LENGTH) throw new Error("Texto muito longo. Divida o histórico em arquivos menores.");

    const client = serviceClient();
    await assertAreaWriter(user.id, orgId, areaId);

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
