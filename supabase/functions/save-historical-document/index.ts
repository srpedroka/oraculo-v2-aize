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
const MAX_BACKUP_CHARS = 200_000;
const MAX_BATCH_DOCS = 12;

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
    sourceMetadata: normalizeSourceMetadata(record.sourceMetadata),
    confirmed: normalizeConfirmed(record.confirmed),
    overridden: normalizeOverridden(record.overridden),
  };
}

function normalizeSourceMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const year = Number(record.year);
  const quarter = Number(record.quarter);
  const month = Number(record.month);
  const evidence = Array.isArray(record.evidence)
    ? record.evidence.slice(0, 24).map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        return {
          field: optionalText(row.field, 40),
          value: optionalText(row.value, 160),
          source: optionalText(row.source, 20),
          confidence: optionalNumber(row.confidence),
          excerpt: optionalText(row.excerpt, 220),
        };
      }).filter(Boolean)
    : [];
  return {
    documentType: optionalText(record.documentType, 30),
    title: optionalText(record.title, 120),
    sourceCompany: optionalText(record.sourceCompany, 160),
    sourceAreaLabel: optionalText(record.sourceAreaLabel, 120),
    matchedAreaId: optionalText(record.matchedAreaId, 80),
    matchedAreaName: optionalText(record.matchedAreaName, 120),
    managerName: optionalText(record.managerName, 120),
    year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null,
    quarter: Number.isInteger(quarter) && quarter >= 1 && quarter <= 4 ? quarter : null,
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : null,
    primaryPeriod: optionalText(record.primaryPeriod, MAX_PERIOD_LENGTH),
    sourceVersion: optionalText(record.sourceVersion, 120),
    evidence,
  };
}

function normalizeRawText(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function stripUnsafeBinary(value: unknown) {
  const text = String(value ?? "");
  // Nunca persistir base64/data-url de imagem.
  if (/^data:image\//i.test(text) || /base64,/i.test(text.slice(0, 200))) return "";
  return text;
}

function normalizeImportBackup(value: unknown, savedCandidateId: string): { backup: Record<string, unknown> | null; warning: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { backup: null, warning: null };
  const record = value as Record<string, unknown>;

  const candidates = Array.isArray(record.candidates)
    ? record.candidates
        .slice(0, MAX_BATCH_DOCS)
        .map((item, index) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          return {
            id: optionalText(row.id, 80) ?? `doc_${index + 1}`,
            title: optionalText(row.title, 100),
            normalizedText: normalizeRawText(stripUnsafeBinary(row.normalizedText)).slice(0, 40_000),
            tableIds: Array.isArray(row.tableIds)
              ? row.tableIds.map((id) => optionalText(id, 40)).filter((id): id is string => Boolean(id)).slice(0, 20)
              : [],
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];

  const tables = Array.isArray(record.tables)
    ? record.tables.slice(0, 20).map((item, index) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        return {
          id: optionalText(row.id, 40) ?? `table_${index + 1}`,
          label: optionalText(row.label, 120) ?? `Tabela ${index + 1}`,
          headers: Array.isArray(row.headers)
            ? row.headers.map((h) => optionalText(h, 80)).filter((h): h is string => Boolean(h)).slice(0, 12)
            : [],
          normalizedText: normalizeRawText(stripUnsafeBinary(row.normalizedText)).slice(0, 12_000),
          years: Array.isArray(row.years)
            ? row.years.map((y) => Number(y)).filter((y) => Number.isInteger(y) && y >= 2000 && y <= 2100).slice(0, 20)
            : [],
          rowCount: Math.max(0, Math.min(500, Number(row.rowCount) || 0)),
          fingerprint: optionalText(row.fingerprint, 40) ?? "",
        };
      }).filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];

  const conflicts = Array.isArray(record.conflicts)
    ? record.conflicts.slice(0, 30).map((item, index) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        return {
          id: optionalText(row.id, 60) ?? `conflict_${index + 1}`,
          kind: optionalText(row.kind, 40) ?? "value",
          message: optionalText(row.message, 320) ?? "Conflito a revisar",
          candidateIds: Array.isArray(row.candidateIds)
            ? row.candidateIds.map((id) => optionalText(id, 40)).filter((id): id is string => Boolean(id)).slice(0, 12)
            : [],
          tableIds: Array.isArray(row.tableIds)
            ? row.tableIds.map((id) => optionalText(id, 40)).filter((id): id is string => Boolean(id)).slice(0, 20)
            : [],
          required: Boolean(row.required),
        };
      }).filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];

  const decisions = Array.isArray(record.decisions)
    ? record.decisions.slice(0, 30).map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        return {
          conflictId: optionalText(row.conflictId, 60),
          selectedCandidateId: optionalText(row.selectedCandidateId, 40) ?? undefined,
          selectedTableId: optionalText(row.selectedTableId, 40) ?? undefined,
        };
      }).filter((item): item is NonNullable<typeof item> => Boolean(item && item.conflictId))
    : [];

  let extractedText = normalizeRawText(stripUnsafeBinary(record.extractedText)).slice(0, MAX_TEXT_LENGTH);
  const sourceKindRaw = optionalText(record.sourceKind, 20);
  const sourceKind = sourceKindRaw === "image" || sourceKindRaw === "document" || sourceKindRaw === "text" ? sourceKindRaw : "text";

  const backup: Record<string, unknown> = {
    schemaVersion: 1,
    batchId: optionalText(record.batchId, 80) ?? crypto.randomUUID(),
    sourceName: optionalText(record.sourceName, MAX_SOURCE_LENGTH),
    sourceKind,
    extractedText,
    candidates,
    tables,
    conflicts,
    decisions,
    savedCandidateId: optionalText(record.savedCandidateId, 40) ?? savedCandidateId,
    confirmed: normalizeConfirmed(record.confirmed),
    sourceMetadata: normalizeSourceMetadata(record.sourceMetadata),
  };

  let serialized = JSON.stringify(backup);
  let warning: string | null = null;
  if (serialized.length > MAX_BACKUP_CHARS) {
    // Trunca prévias de tabelas/candidatos e preserva decisões + fingerprints.
    backup.extractedText = extractedText.slice(0, 40_000);
    backup.tables = tables.map((table) => ({
      ...table,
      normalizedText: table.normalizedText.slice(0, 800),
    }));
    backup.candidates = candidates.map((candidate) => ({
      ...candidate,
      normalizedText: candidate.normalizedText.slice(0, 2_000),
    }));
    serialized = JSON.stringify(backup);
    warning = "Backup truncado para caber no limite; decisões e fingerprints preservados.";
    if (serialized.length > MAX_BACKUP_CHARS) {
      backup.extractedText = String(backup.extractedText).slice(0, 10_000);
      backup.tables = (backup.tables as Array<Record<string, unknown>>).map((table) => ({
        id: table.id,
        label: table.label,
        years: table.years,
        rowCount: table.rowCount,
        fingerprint: table.fingerprint,
        headers: table.headers,
        normalizedText: "",
      }));
      warning = "Backup truncado de forma agressiva; decisões e fingerprints preservados.";
    }
  }

  return { backup, warning };
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
    if (!orgId) throw new Error("Empresa ausente");
    const rawDocuments = Array.isArray(payload.documents) && payload.documents.length
      ? payload.documents.slice(0, MAX_BATCH_DOCS)
      : [payload];
    const documents = rawDocuments.map((value: unknown, index: number) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Documento ${index + 1} inválido`);
      const record = value as Record<string, unknown>;
      const areaId = record.areaId ? asText(record.areaId) : null;
      const documentType = asText(record.documentType) as PlanDocumentType;
      const period = asText(record.period);
      const rawText = normalizeRawText(stripUnsafeBinary(record.rawText));
      const savedCandidateId = optionalText(record.savedCandidateId, 40) ?? `doc_${index + 1}`;
      const backup = normalizeImportBackup(record.importBackup, savedCandidateId);
      if (!DOCUMENT_TYPES.has(documentType)) throw new Error(`Tipo inválido no documento ${index + 1}`);
      if (!period) throw new Error(`Informe o período do documento ${index + 1}`);
      if (period.length > MAX_PERIOD_LENGTH) throw new Error(`Período muito longo no documento ${index + 1}`);
      if (!rawText) throw new Error(`Texto ausente no documento ${index + 1}`);
      if (rawText.length > MAX_TEXT_LENGTH) throw new Error(`Documento ${index + 1} muito longo. Divida o histórico em arquivos menores.`);
      return {
        areaId,
        documentType,
        period,
        rawText,
        source: optionalText(record.source, MAX_SOURCE_LENGTH),
        note: optionalText(record.note, MAX_NOTE_LENGTH),
        requestedTitle: optionalText(record.title, 120),
        summary: optionalText(record.summary, 320),
        classification: normalizeClassification(record.classification),
        sourceMetadata: normalizeSourceMetadata(record.sourceMetadata),
        savedCandidateId,
        importBackup: backup.backup,
        backupWarning: backup.warning,
      };
    });

    const client = serviceClient();
    const memberships = await Promise.all(documents.map((document) => assertAreaWriter(user.id, orgId, document.areaId)));
    if (memberships.some((membership) => membership.role === "admin")) throw new Error("Admin não pode importar histórico");

    const [{ data: organization, error: orgError }, profileResult, areas] = await Promise.all([
      client.from("organizations").select("name").eq("id", orgId).maybeSingle(),
      client.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
      Promise.all(documents.map((document) => loadArea(client, orgId, document.areaId))),
    ]);
    if (orgError) throw orgError;
    if (!organization) throw new Error("Empresa inválida");
    if (profileResult.error) throw profileResult.error;

    const importedAt = new Date().toISOString();
    const versionOffsets = new Map<string, number>();
    const rows = [];
    for (let index = 0; index < documents.length; index += 1) {
      const document = documents[index];
      const area = areas[index];
      const key = `${document.areaId ?? "company"}:${document.documentType}:${document.period}`;
      const baseVersion = await nextHistoricalVersion(client, orgId, document.areaId, document.documentType, document.period);
      const offset = versionOffsets.get(key) ?? 0;
      versionOffsets.set(key, offset + 1);
      const areaLabel = area?.name ? ` · ${area.name}` : "";
      const content: Record<string, unknown> = {
        empresa: organization.name ?? "Empresa",
        area: area?.name ?? null,
        periodo: document.period,
        gestor: profileResult.data?.full_name ?? profileResult.data?.email ?? "",
        raw: document.rawText,
        source: document.source,
        note: document.note,
        summary: document.summary,
        classification: document.classification,
        source_metadata: document.sourceMetadata,
        imported_at: importedAt,
      };
      if (document.importBackup) {
        content.import_backup = document.importBackup;
        if (document.backupWarning) content.import_backup_warning = document.backupWarning;
      }
      rows.push({
        org_id: orgId,
        area_id: document.areaId,
        session_id: null,
        type: document.documentType,
        origin: "historical",
        period: document.period,
        title: document.requestedTitle ?? `${TYPE_LABEL[document.documentType]} histórico${areaLabel} · ${document.period}`,
        content,
        version: baseVersion + offset,
        created_by: user.id,
      });
    }

    const { data, error } = await client
      .from("plan_documents")
      .insert(rows)
      .select("*");
    if (error) throw error;

    return jsonResponse({ document: data?.[0] ?? null, documents: data ?? [], warning: documents.map((item) => item.backupWarning).filter(Boolean).join(" ") || null });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Não foi possível salvar o histórico" }, 400);
  }
});
