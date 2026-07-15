import { AwsClient } from "npm:aws4fetch@1.0.20";
import { serviceClient } from "./auth.ts";
import { decodeBackupPayload, encodeBackupPayload } from "./backup-codec.ts";
import { normalizeS3Endpoint } from "./s3-endpoint.ts";

const STORAGE_BUCKET = "organization-backups";
const BACKUP_FORMAT = "oraculo-organization-backup";
const FILE_FORMAT = "oraculo-organization-backup-file";
const SCHEMA_VERSION = 1;
const PAGE_SIZE = 1000;
const INSERT_BATCH_SIZE = 200;
const EXTERNAL_REQUEST_TIMEOUT_MS = 30_000;
const EXTERNAL_REQUEST_MAX_ATTEMPTS = 2;

type JsonRow = Record<string, any>;
type BackupKind = "manual" | "event" | "daily" | "weekly" | "monthly";
export type BackupSourceKind = "unknown" | "internal" | "external" | "portable";

const RECOVERY_CRITICAL_TABLES = [
  "areas",
  "strategic_plans",
  "area_plans",
  "objectives",
  "key_actions",
  "strategic_projects",
  "evidences",
  "check_ins",
  "plan_documents",
  "executive_kpis",
  "kpi_monthly_values",
  "objective_kpi_links",
] as const;

type BackupPolicy = {
  org_id: string;
  automatic_enabled: boolean;
  event_snapshots_enabled: boolean;
  event_retention_days: number;
  daily_retention_days: number;
  weekly_retention_days: number;
  monthly_retention_days: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_failure_message: string | null;
};

export type OrganizationBackupPackage = {
  manifest: {
    format: typeof BACKUP_FORMAT;
    schemaVersion: number;
    createdAt: string;
    sourceVersion: string;
    sourceOrganization: { id: string; name: string; subtitle: string | null };
    recordCounts: Record<string, number>;
    exclusions: string[];
  };
  data: Record<string, JsonRow[]>;
};

export type OrganizationBackupEnvelope = {
  format: typeof FILE_FORMAT;
  version: number;
  checksum: string;
  payload: OrganizationBackupPackage;
};

const TABLE_EXPORTS: Array<{ table: string; select: string; order: string }> = [
  { table: "memberships", select: "*", order: "id" },
  { table: "areas", select: "*", order: "id" },
  { table: "strategic_plans", select: "*", order: "id" },
  { table: "area_plans", select: "*", order: "id" },
  { table: "objectives", select: "*", order: "id" },
  { table: "key_actions", select: "*", order: "id" },
  { table: "strategic_projects", select: "*", order: "id" },
  { table: "evidences", select: "*", order: "id" },
  { table: "conversations", select: "*", order: "id" },
  { table: "chat_messages", select: "*", order: "id" },
  { table: "check_ins", select: "*", order: "id" },
  {
    table: "ai_settings",
    select:
      "org_id,provider,model,input_token_price_usd_per_million,output_token_price_usd_per_million,pricing_source,updated_at",
    order: "org_id",
  },
  { table: "ai_function_settings", select: "*", order: "function" },
  { table: "ai_usage_logs", select: "*", order: "id" },
  { table: "ai_control_policies", select: "*", order: "org_id" },
  { table: "ai_limit_events", select: "*", order: "id" },
  {
    table: "whatsapp_settings",
    select: "org_id,instance_url,instance_name,connected_number,enabled,weekly_pulse_enabled,weekly_pulse_weekday,weekly_pulse_hour,updated_at",
    order: "org_id",
  },
  { table: "planning_sessions", select: "*", order: "id" },
  { table: "plan_documents", select: "*", order: "id" },
  { table: "executive_kpis", select: "*", order: "id" },
  { table: "kpi_monthly_values", select: "*", order: "id" },
  { table: "objective_kpi_links", select: "*", order: "id" },
  { table: "operational_revisions", select: "*", order: "id" },
  { table: "administrative_audit_events", select: "*", order: "id" },
  { table: "organization_recovery_incidents", select: "*", order: "id" },
  { table: "org_ai_tone", select: "*", order: "org_id" },
  {
    table: "organization_backup_policies",
    select:
      "org_id,automatic_enabled,event_snapshots_enabled,event_retention_days,daily_retention_days,weekly_retention_days,monthly_retention_days",
    order: "org_id",
  },
];

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 700);
}

function mapId(map: Map<string, string>, value: unknown) {
  return typeof value === "string" ? map.get(value) ?? null : null;
}

function rowsOf(data: Record<string, JsonRow[]>, table: string) {
  const rows = data[table];
  return Array.isArray(rows) ? rows : [];
}

async function fetchOrgRows(
  client: ReturnType<typeof serviceClient>,
  table: string,
  select: string,
  order: string,
  orgId: string,
) {
  const result: JsonRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select(select)
      .eq("org_id", orgId)
      .order(order, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Falha ao exportar ${table}: ${error.message}`);
    const page = (data ?? []) as JsonRow[];
    result.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return result;
}

async function fetchProfiles(client: ReturnType<typeof serviceClient>, ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const result: JsonRow[] = [];
  for (let index = 0; index < uniqueIds.length; index += 100) {
    const { data, error } = await client
      .from("profiles")
      .select("id,full_name,email,phone,created_at")
      .in("id", uniqueIds.slice(index, index + 100));
    if (error) throw new Error(`Falha ao exportar perfis: ${error.message}`);
    result.push(...((data ?? []) as JsonRow[]));
  }
  return result.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function referencedProfileIds(organization: JsonRow, data: Record<string, JsonRow[]>) {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string") ids.add(value);
  };

  add(organization.created_by);
  rowsOf(data, "memberships").forEach((row) => add(row.user_id));
  rowsOf(data, "areas").forEach((row) => add(row.archived_by));
  rowsOf(data, "strategic_plans").forEach((row) => add(row.updated_by));
  rowsOf(data, "area_plans").forEach((row) => add(row.updated_by));
  rowsOf(data, "objectives").forEach((row) => add(row.archived_by));
  rowsOf(data, "key_actions").forEach((row) => add(row.archived_by));
  rowsOf(data, "strategic_projects").forEach((row) => add(row.archived_by));
  rowsOf(data, "evidences").forEach((row) => {
    add(row.created_by);
    add(row.archived_by);
  });
  rowsOf(data, "conversations").forEach((row) => add(row.user_id));
  rowsOf(data, "chat_messages").forEach((row) => add(row.user_id));
  rowsOf(data, "check_ins").forEach((row) => {
    add(row.created_by);
    add(row.archived_by);
  });
  rowsOf(data, "planning_sessions").forEach((row) => add(row.user_id));
  rowsOf(data, "plan_documents").forEach((row) => {
    add(row.created_by);
    add(row.archived_by);
  });
  rowsOf(data, "kpi_monthly_values").forEach((row) => add(row.updated_by));
  rowsOf(data, "objective_kpi_links").forEach((row) => add(row.created_by));
  rowsOf(data, "org_ai_tone").forEach((row) => add(row.updated_by));
  rowsOf(data, "operational_revisions").forEach((row) => add(row.changed_by));
  rowsOf(data, "administrative_audit_events").forEach((row) => {
    add(row.actor_user_id);
    add(row.target_user_id);
  });
  rowsOf(data, "organization_recovery_incidents").forEach((row) => {
    add(row.opened_by);
    add(row.resolved_by);
  });
  rowsOf(data, "ai_control_policies").forEach((row) => add(row.updated_by));
  rowsOf(data, "ai_limit_events").forEach((row) => add(row.user_id));
  return [...ids];
}

async function sha256Hex(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function externalConfig() {
  const endpoint = Deno.env.get("BACKUP_S3_ENDPOINT");
  const bucket = Deno.env.get("BACKUP_S3_BUCKET");
  const accessKeyId = Deno.env.get("BACKUP_S3_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("BACKUP_S3_SECRET_ACCESS_KEY");
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint: normalizeS3Endpoint(endpoint, bucket),
    bucket,
    accessKeyId,
    secretAccessKey,
    region: Deno.env.get("BACKUP_S3_REGION") ?? "auto",
  };
}

function externalClient(config: NonNullable<ReturnType<typeof externalConfig>>) {
  return new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    service: "s3",
  });
}

function externalObjectUrl(
  config: NonNullable<ReturnType<typeof externalConfig>>,
  objectKey: string,
) {
  const path = [config.bucket, ...objectKey.split("/")]
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${config.endpoint}/${path}`;
}

async function externalFetch(
  config: NonNullable<ReturnType<typeof externalConfig>>,
  objectKey: string,
  init: RequestInit,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= EXTERNAL_REQUEST_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await externalClient(config).fetch(
        externalObjectUrl(config, objectKey),
        { ...init, signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS) },
      );
      if (response.ok) return response;
      const responseError = new Error(`Réplica externa respondeu HTTP ${response.status}`);
      if (response.status < 500 || attempt === EXTERNAL_REQUEST_MAX_ATTEMPTS) {
        throw responseError;
      }
      lastError = responseError;
    } catch (error) {
      lastError = error;
      if (attempt === EXTERNAL_REQUEST_MAX_ATTEMPTS) throw error;
    }
  }
  throw lastError ?? new Error("Falha desconhecida na réplica externa");
}

async function uploadExternal(objectKey: string, body: Uint8Array) {
  const config = externalConfig();
  if (!config) return { status: "not_configured" as const, error: null };
  try {
    await externalFetch(config, objectKey, {
      method: "PUT",
      body,
      headers: {
        "content-type": "application/gzip",
      },
    });
    return { status: "completed" as const, error: null };
  } catch (error) {
    return { status: "failed" as const, error: errorMessage(error) };
  }
}

async function downloadExternal(objectKey: string) {
  const config = externalConfig();
  if (!config) throw new Error("Cópia externa não configurada");
  const response = await externalFetch(config, objectKey, { method: "GET" });
  return new Uint8Array(await response.arrayBuffer());
}

export function hasExternalBackupConfig() {
  return Boolean(externalConfig());
}

export async function buildOrganizationEnvelope(orgId: string) {
  const client = serviceClient();
  const { data: organization, error: organizationError } = await client
    .from("organizations")
    .select("id,name,subtitle,created_by,created_at")
    .eq("id", orgId)
    .maybeSingle();
  if (organizationError) throw organizationError;
  if (!organization) throw new Error("Empresa não encontrada");

  const exportedData: Record<string, JsonRow[]> = {
    organizations: [organization as JsonRow],
  };

  for (const definition of TABLE_EXPORTS) {
    exportedData[definition.table] = await fetchOrgRows(
      client,
      definition.table,
      definition.select,
      definition.order,
      orgId,
    );
  }

  exportedData.profiles = await fetchProfiles(
    client,
    referencedProfileIds(organization as JsonRow, exportedData),
  );

  const recordCounts = Object.fromEntries(
    Object.entries(exportedData).map(([table, rows]) => [table, rows.length]),
  );
  const payload: OrganizationBackupPackage = {
    manifest: {
      format: BACKUP_FORMAT,
      schemaVersion: SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      sourceVersion: "2026-07-15",
      sourceOrganization: {
        id: organization.id,
        name: organization.name,
        subtitle: organization.subtitle,
      },
      recordCounts,
      exclusions: [
        "auth.users e senhas",
        "ai_model_keys",
        "ai_provider_key_status",
        "whatsapp_instance_keys",
        "whatsapp_processed_events",
        "arquivos e mídias temporárias",
        "metadados de backups anteriores",
      ],
    },
    data: exportedData,
  };
  const checksum = await sha256Hex(JSON.stringify(payload));
  const envelope: OrganizationBackupEnvelope = {
    format: FILE_FORMAT,
    version: 1,
    checksum,
    payload,
  };
  return envelope;
}

export async function verifyOrganizationEnvelope(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Pacote de backup inválido");
  const envelope = value as OrganizationBackupEnvelope;
  if (envelope.format !== FILE_FORMAT || envelope.version !== 1) {
    throw new Error("Formato de pacote não reconhecido");
  }
  if (
    envelope.payload?.manifest?.format !== BACKUP_FORMAT ||
    envelope.payload.manifest.schemaVersion !== SCHEMA_VERSION ||
    !envelope.payload.data ||
    typeof envelope.payload.data !== "object"
  ) {
    throw new Error("Versão do pacote incompatível");
  }
  const checksum = await sha256Hex(JSON.stringify(envelope.payload));
  if (checksum !== envelope.checksum) throw new Error("O pacote falhou na verificação de integridade");
  const totalRows = Object.values(envelope.payload.data).reduce(
    (total, rows) => total + (Array.isArray(rows) ? rows.length : 0),
    0,
  );
  if (totalRows > 50_000) throw new Error("Pacote excede o limite seguro de registros");
  return envelope;
}

function expirationFor(kind: BackupKind, policy: BackupPolicy) {
  if (kind === "manual") return null;
  const days =
    kind === "event"
      ? policy.event_retention_days
      : kind === "daily"
        ? policy.daily_retention_days
        : kind === "weekly"
          ? policy.weekly_retention_days
          : policy.monthly_retention_days;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

async function getPolicy(orgId: string) {
  const client = serviceClient();
  const { data, error } = await client
    .from("organization_backup_policies")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as BackupPolicy;
  const { data: inserted, error: insertError } = await client
    .from("organization_backup_policies")
    .insert({ org_id: orgId })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return inserted as BackupPolicy;
}

export async function createOrganizationBackup(
  orgId: string,
  kind: BackupKind,
  initiatedBy: string | null,
) {
  const client = serviceClient();
  const policy = await getPolicy(orgId);
  const externalConfigured = hasExternalBackupConfig();
  const { data: backup, error: insertError } = await client
    .from("organization_backups")
    .insert({
      org_id: orgId,
      kind,
      status: "pending",
      initiated_by: initiatedBy,
      external_status: externalConfigured ? "pending" : "not_configured",
      expires_at: expirationFor(kind, policy),
    })
    .select("*")
    .single();
  if (insertError) {
    if (insertError.code === "23505") throw new Error("Já existe um backup em andamento para esta empresa");
    throw insertError;
  }

  const objectPath = `${orgId}/${new Date().getUTCFullYear()}/${backup.id}.json.gz`;
  try {
    const envelope = await buildOrganizationEnvelope(orgId);
    const compressed = await encodeBackupPayload(JSON.stringify(envelope));
    const { error: uploadError } = await client.storage
      .from(STORAGE_BUCKET)
      .upload(objectPath, compressed, {
        contentType: "application/gzip",
        cacheControl: "0",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const external = await uploadExternal(objectPath, compressed);
    const recordCount = Object.values(envelope.payload.manifest.recordCounts).reduce(
      (total, count) => total + count,
      0,
    );
    const completedAt = new Date().toISOString();
    const { data: completed, error: completeError } = await client
      .from("organization_backups")
      .update({
        status: "completed",
        object_path: objectPath,
        checksum: envelope.checksum,
        size_bytes: compressed.byteLength,
        record_count: recordCount,
        manifest: envelope.payload.manifest,
        external_status: external.status,
        external_object_key: external.status === "completed" ? objectPath : null,
        external_error_message: external.error,
        completed_at: completedAt,
        error_message: null,
      })
      .eq("id", backup.id)
      .select("*")
      .single();
    if (completeError) throw completeError;

    await client
      .from("organization_backup_policies")
      .update({
        last_success_at: completedAt,
        last_failure_at: null,
        last_failure_message: null,
      })
      .eq("org_id", orgId);
    return completed;
  } catch (error) {
    const message = errorMessage(error);
    await client
      .from("organization_backups")
      .update({ status: "failed", object_path: objectPath, error_message: message, completed_at: new Date().toISOString() })
      .eq("id", backup.id);
    await client
      .from("organization_backup_policies")
      .update({ last_failure_at: new Date().toISOString(), last_failure_message: message })
      .eq("org_id", orgId);
    throw error;
  }
}

async function backupRow(orgId: string, backupId: string) {
  const client = serviceClient();
  const { data, error } = await client
    .from("organization_backups")
    .select("*")
    .eq("id", backupId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "completed" || !data.object_path) {
    throw new Error("Backup concluído não encontrado");
  }
  return data as JsonRow;
}

export async function loadOrganizationEnvelopeWithSource(
  orgId: string,
  backupId: string,
  source: "auto" | "internal" | "external" = "auto",
) {
  const client = serviceClient();
  const backup = await backupRow(orgId, backupId);
  let compressed: Uint8Array;
  let sourceKind: BackupSourceKind;

  if (source === "external") {
    if (backup.external_status !== "completed" || !backup.external_object_key) {
      throw new Error("Cópia externa concluída não encontrada para este backup");
    }
    compressed = await downloadExternal(backup.external_object_key);
    sourceKind = "external";
  } else {
    const { data, error } = await client.storage.from(STORAGE_BUCKET).download(backup.object_path);
    if (!error && data) {
      compressed = new Uint8Array(await data.arrayBuffer());
      sourceKind = "internal";
    } else if (source === "auto" && backup.external_status === "completed" && backup.external_object_key) {
      compressed = await downloadExternal(backup.external_object_key);
      sourceKind = "external";
    } else {
      throw new Error(`Arquivo interno do backup indisponível: ${error?.message ?? "sem conteúdo"}`);
    }
  }

  // Some S3-compatible clients transparently decode objects that were stored
  // with Content-Encoding: gzip. Accept both byte representations and keep the
  // envelope checksum as the integrity boundary.
  const parsed = JSON.parse(await decodeBackupPayload(compressed));
  const envelope = await verifyOrganizationEnvelope(parsed);
  if (envelope.checksum !== backup.checksum) throw new Error("Checksum diferente do registro do backup");
  return { envelope, sourceKind };
}

export async function loadOrganizationEnvelope(orgId: string, backupId: string) {
  return (await loadOrganizationEnvelopeWithSource(orgId, backupId)).envelope;
}

async function insertRows(
  client: ReturnType<typeof serviceClient>,
  table: string,
  rows: JsonRow[],
) {
  if (!rows.length) return 0;
  for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
    const { error } = await client.from(table).insert(rows.slice(index, index + INSERT_BATCH_SIZE));
    if (error) throw new Error(`Falha ao restaurar ${table}: ${error.message}`);
  }
  return rows.length;
}

async function existingProfilesByEmail(client: ReturnType<typeof serviceClient>, profiles: JsonRow[]) {
  const emails = [...new Set(profiles.map((profile) => String(profile.email ?? "").trim().toLowerCase()).filter(Boolean))];
  const result: JsonRow[] = [];
  for (let index = 0; index < emails.length; index += 100) {
    const { data, error } = await client
      .from("profiles")
      .select("id,email")
      .in("email", emails.slice(index, index + 100));
    if (error) throw error;
    result.push(...((data ?? []) as JsonRow[]));
  }
  return new Map(result.map((profile) => [String(profile.email).trim().toLowerCase(), String(profile.id)]));
}

function restoredOrganizationName(sourceName: string) {
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  return `${sourceName} - restauração ${date}`;
}

async function verifyRestoredOrganization(
  client: ReturnType<typeof serviceClient>,
  targetOrgId: string,
  expectedCounts: Record<string, number>,
  restoredCounts: Record<string, number>,
) {
  const mismatchedTables = RECOVERY_CRITICAL_TABLES.filter(
    (table) => Number(restoredCounts[table] ?? 0) !== Number(expectedCounts[table] ?? 0),
  );
  const [aiKeys, whatsappKeys, whatsappSettings] = await Promise.all([
    client.from("ai_model_keys").select("org_id", { count: "exact", head: true }).eq("org_id", targetOrgId),
    client.from("whatsapp_instance_keys").select("org_id", { count: "exact", head: true }).eq("org_id", targetOrgId),
    client.from("whatsapp_settings").select("enabled,inbound_queue_enabled,outbound_outbox_enabled").eq("org_id", targetOrgId).maybeSingle(),
  ]);
  for (const result of [aiKeys, whatsappKeys, whatsappSettings]) {
    if (result.error) throw result.error;
  }

  const secretsExcluded = Number(aiKeys.count ?? 0) === 0 && Number(whatsappKeys.count ?? 0) === 0;
  const whatsappDisabled = !whatsappSettings.data || (
    whatsappSettings.data.enabled !== true &&
    whatsappSettings.data.inbound_queue_enabled !== true &&
    whatsappSettings.data.outbound_outbox_enabled !== true
  );
  return {
    passed: mismatchedTables.length === 0 && secretsExcluded && whatsappDisabled,
    checksumVerified: true,
    criticalCountsMatch: mismatchedTables.length === 0,
    mismatchedTables,
    secretsExcluded,
    whatsappDisabled,
  };
}

export async function restoreOrganizationEnvelope(input: {
  auditOrgId: string | null;
  userId: string;
  envelope: OrganizationBackupEnvelope;
  backupId?: string | null;
  exerciseType?: "restore" | "monthly_drill" | "disaster_drill";
  sourceKind?: BackupSourceKind;
}) {
  const startedAt = performance.now();
  const client = serviceClient();
  const envelope = await verifyOrganizationEnvelope(input.envelope);
  const data = envelope.payload.data;
  const sourceOrganization = rowsOf(data, "organizations")[0];
  if (!sourceOrganization?.name) throw new Error("O pacote não contém a empresa de origem");
  const targetOrgId = crypto.randomUUID();
  const targetOrgName = restoredOrganizationName(String(sourceOrganization.name));
  const warnings: string[] = [];
  const restoredCounts: Record<string, number> = {};
  let verification: JsonRow = {};
  const sourceKind = input.sourceKind ?? (input.backupId ? "unknown" : "portable");

  const { data: restoreRun, error: restoreRunError } = await client
    .from("organization_restore_runs")
    .insert({
      source_org_id: input.auditOrgId,
      backup_id: input.backupId ?? null,
      target_org_id: targetOrgId,
      target_org_name: targetOrgName,
      initiated_by: input.userId,
      status: "pending",
      exercise_type: input.exerciseType ?? "restore",
      source_kind: sourceKind,
      source_checksum: envelope.checksum,
    })
    .select("id")
    .single();
  if (restoreRunError) throw restoreRunError;

  try {
    const { error: organizationError } = await client.from("organizations").insert({
      id: targetOrgId,
      name: targetOrgName,
      subtitle: sourceOrganization.subtitle ?? null,
      created_by: input.userId,
    });
    if (organizationError) throw organizationError;
    restoredCounts.organizations = 1;

    const sourceProfiles = rowsOf(data, "profiles");
    const existingByEmail = await existingProfilesByEmail(client, sourceProfiles);
    const { data: currentProfile, error: currentProfileError } = await client
      .from("profiles")
      .select("id,email")
      .eq("id", input.userId)
      .single();
    if (currentProfileError) throw currentProfileError;

    const userMap = new Map<string, string>();
    for (const profile of sourceProfiles) {
      const email = String(profile.email ?? "").trim().toLowerCase();
      if (profile.id === input.userId || (email && email === String(currentProfile.email ?? "").trim().toLowerCase())) {
        userMap.set(String(profile.id), input.userId);
      } else if (email && existingByEmail.has(email)) {
        userMap.set(String(profile.id), existingByEmail.get(email)!);
      }
    }

    const membershipMap = new Map<string, string>();
    const targetMembershipByUser = new Map<string, string>();
    const currentMembershipId = crypto.randomUUID();
    targetMembershipByUser.set(input.userId, currentMembershipId);
    const targetMemberships: JsonRow[] = [
      { id: currentMembershipId, org_id: targetOrgId, user_id: input.userId, role: "owner", created_at: new Date().toISOString() },
    ];
    for (const membership of rowsOf(data, "memberships")) {
      const mappedUser = userMap.get(String(membership.user_id));
      if (!mappedUser) {
        const profile = sourceProfiles.find((item) => item.id === membership.user_id);
        warnings.push(`Membro ${profile?.email ?? membership.user_id} precisa ser convidado novamente.`);
        continue;
      }
      const existingMembershipId = targetMembershipByUser.get(mappedUser);
      if (existingMembershipId) {
        membershipMap.set(String(membership.id), existingMembershipId);
        continue;
      }
      const newMembershipId = crypto.randomUUID();
      targetMembershipByUser.set(mappedUser, newMembershipId);
      membershipMap.set(String(membership.id), newMembershipId);
      targetMemberships.push({
        ...membership,
        id: newMembershipId,
        org_id: targetOrgId,
        user_id: mappedUser,
      });
    }
    restoredCounts.memberships = await insertRows(client, "memberships", targetMemberships);

    const areaMap = new Map<string, string>();
    const areas = rowsOf(data, "areas").map((row) => {
      const id = crypto.randomUUID();
      areaMap.set(String(row.id), id);
      return {
        ...row,
        id,
        org_id: targetOrgId,
        coordinator_id: mapId(membershipMap, row.coordinator_id),
        archived_by: mapId(userMap, row.archived_by),
      };
    });
    restoredCounts.areas = await insertRows(client, "areas", areas);

    const strategicPlanMap = new Map<string, string>();
    const strategicPlans = rowsOf(data, "strategic_plans").map((row) => {
      const id = crypto.randomUUID();
      strategicPlanMap.set(String(row.id), id);
      return { ...row, id, org_id: targetOrgId, updated_by: mapId(userMap, row.updated_by) };
    });
    restoredCounts.strategic_plans = await insertRows(client, "strategic_plans", strategicPlans);

    const objectiveMap = new Map<string, string>();
    const objectives = rowsOf(data, "objectives").map((row) => {
      const id = crypto.randomUUID();
      objectiveMap.set(String(row.id), id);
      return {
        ...row,
        id,
        org_id: targetOrgId,
        area_id: mapId(areaMap, row.area_id),
        parent_id: null,
        archived_by: mapId(userMap, row.archived_by),
      };
    });
    restoredCounts.objectives = await insertRows(client, "objectives", objectives);
    for (const sourceObjective of rowsOf(data, "objectives")) {
      const id = objectiveMap.get(String(sourceObjective.id));
      const parentId = mapId(objectiveMap, sourceObjective.parent_id);
      if (!id || !parentId) continue;
      const { error } = await client.from("objectives").update({ parent_id: parentId }).eq("id", id);
      if (error) throw new Error(`Falha ao restaurar hierarquia de objetivos: ${error.message}`);
    }

    const areaPlanMap = new Map<string, string>();
    const areaPlans = rowsOf(data, "area_plans").map((row) => {
      const id = crypto.randomUUID();
      areaPlanMap.set(String(row.id), id);
      return {
        ...row,
        id,
        org_id: targetOrgId,
        area_id: mapId(areaMap, row.area_id),
        main_annual_objective_id: mapId(objectiveMap, row.main_annual_objective_id),
        linked_strategic_objective_ids: Array.isArray(row.linked_strategic_objective_ids)
          ? row.linked_strategic_objective_ids.map((objectiveId: string) => objectiveMap.get(objectiveId)).filter(Boolean)
          : [],
        updated_by: mapId(userMap, row.updated_by),
      };
    });
    restoredCounts.area_plans = await insertRows(client, "area_plans", areaPlans);

    const keyActionMap = new Map<string, string>();
    const keyActions = rowsOf(data, "key_actions")
      .map((row) => {
        const id = crypto.randomUUID();
        keyActionMap.set(String(row.id), id);
        return {
          ...row,
          id,
          org_id: targetOrgId,
          objective_id: mapId(objectiveMap, row.objective_id),
          archived_by: mapId(userMap, row.archived_by),
        };
      })
      .filter((row) => row.objective_id);
    restoredCounts.key_actions = await insertRows(client, "key_actions", keyActions);

    const strategicProjectMap = new Map<string, string>();
    const strategicProjects = rowsOf(data, "strategic_projects").map((row) => {
      const id = crypto.randomUUID();
      strategicProjectMap.set(String(row.id), id);
      return {
        ...row,
        id,
        org_id: targetOrgId,
        plan_id: mapId(strategicPlanMap, row.plan_id),
        linked_objective_id: mapId(objectiveMap, row.linked_objective_id),
        archived_by: mapId(userMap, row.archived_by),
      };
    });
    restoredCounts.strategic_projects = await insertRows(client, "strategic_projects", strategicProjects);

    const evidenceMap = new Map<string, string>();
    const evidences = rowsOf(data, "evidences")
      .map((row) => {
        const id = crypto.randomUUID();
        evidenceMap.set(String(row.id), id);
        return {
          ...row,
          id,
          org_id: targetOrgId,
          objective_id: mapId(objectiveMap, row.objective_id),
          created_by: mapId(userMap, row.created_by),
          archived_by: mapId(userMap, row.archived_by),
        };
      })
      .filter((row) => row.objective_id);
    restoredCounts.evidences = await insertRows(client, "evidences", evidences);

    const checkInMap = new Map<string, string>();
    const checkIns = rowsOf(data, "check_ins").map((row) => {
      const id = crypto.randomUUID();
      checkInMap.set(String(row.id), id);
      return {
        ...row,
        id,
        org_id: targetOrgId,
        area_id: mapId(areaMap, row.area_id),
        created_by: mapId(userMap, row.created_by),
        archived_by: mapId(userMap, row.archived_by),
      };
    });
    restoredCounts.check_ins = await insertRows(client, "check_ins", checkIns);

    const conversationMap = new Map<string, string>();
    const conversations = rowsOf(data, "conversations")
      .map((row) => {
        const userId = mapId(userMap, row.user_id);
        if (!userId) return null;
        const id = crypto.randomUUID();
        conversationMap.set(String(row.id), id);
        return { ...row, id, org_id: targetOrgId, user_id: userId, area_id: mapId(areaMap, row.area_id), pending_context: {} };
      })
      .filter(Boolean) as JsonRow[];
    restoredCounts.conversations = await insertRows(client, "conversations", conversations);

    const chatMessages = rowsOf(data, "chat_messages").map((row) => ({
      ...row,
      id: crypto.randomUUID(),
      org_id: targetOrgId,
      area_id: mapId(areaMap, row.area_id),
      user_id: mapId(userMap, row.user_id),
      conversation_id: mapId(conversationMap, row.conversation_id),
    }));
    restoredCounts.chat_messages = await insertRows(client, "chat_messages", chatMessages);

    const sessionMap = new Map<string, string>();
    const planningSessions = rowsOf(data, "planning_sessions")
      .map((row) => {
        const userId = mapId(userMap, row.user_id);
        if (!userId) return null;
        const id = crypto.randomUUID();
        sessionMap.set(String(row.id), id);
        const wasActive = row.status === "active";
        if (wasActive) warnings.push("Sessões que estavam em andamento foram restauradas como abandonadas.");
        return {
          ...row,
          id,
          org_id: targetOrgId,
          area_id: mapId(areaMap, row.area_id),
          user_id: userId,
          conversation_id: mapId(conversationMap, row.conversation_id),
          status: wasActive ? "abandoned" : row.status,
          pending_proposal: wasActive ? null : row.pending_proposal,
        };
      })
      .filter(Boolean) as JsonRow[];
    restoredCounts.planning_sessions = await insertRows(client, "planning_sessions", planningSessions);

    const planDocumentMap = new Map<string, string>();
    const planDocuments = rowsOf(data, "plan_documents").map((row) => {
      const id = crypto.randomUUID();
      planDocumentMap.set(String(row.id), id);
      return {
        ...row,
        id,
        org_id: targetOrgId,
        area_id: mapId(areaMap, row.area_id),
        session_id: mapId(sessionMap, row.session_id),
        created_by: mapId(userMap, row.created_by),
        archived_by: mapId(userMap, row.archived_by),
      };
    });
    restoredCounts.plan_documents = await insertRows(client, "plan_documents", planDocuments);

    const kpiMap = new Map<string, string>();
    const executiveKpis = rowsOf(data, "executive_kpis").map((row) => {
      const id = crypto.randomUUID();
      kpiMap.set(String(row.id), id);
      return { ...row, id, org_id: targetOrgId };
    });
    restoredCounts.executive_kpis = await insertRows(client, "executive_kpis", executiveKpis);

    const kpiValueMap = new Map<string, string>();
    const kpiValues = rowsOf(data, "kpi_monthly_values")
      .map((row) => {
        const id = crypto.randomUUID();
        kpiValueMap.set(String(row.id), id);
        return {
          ...row,
          id,
          org_id: targetOrgId,
          kpi_id: mapId(kpiMap, row.kpi_id),
          updated_by: mapId(userMap, row.updated_by),
        };
      })
      .filter((row) => row.kpi_id);
    restoredCounts.kpi_monthly_values = await insertRows(client, "kpi_monthly_values", kpiValues);

    const objectiveKpiLinks = rowsOf(data, "objective_kpi_links")
      .map((row) => ({
        ...row,
        id: crypto.randomUUID(),
        org_id: targetOrgId,
        objective_id: mapId(objectiveMap, row.objective_id),
        kpi_id: mapId(kpiMap, row.kpi_id),
        created_by: mapId(userMap, row.created_by),
      }))
      .filter((row) => row.objective_id && row.kpi_id);
    restoredCounts.objective_kpi_links = await insertRows(client, "objective_kpi_links", objectiveKpiLinks);

    const revisionEntityMaps: Record<string, Map<string, string>> = {
      strategic_plan: strategicPlanMap,
      area_plan: areaPlanMap,
      objective: objectiveMap,
      key_action: keyActionMap,
      strategic_project: strategicProjectMap,
      evidence: evidenceMap,
      check_in: checkInMap,
      plan_document: planDocumentMap,
      executive_kpi: kpiMap,
      kpi_monthly_value: kpiValueMap,
    };
    // Parent-link updates above fire normal audit triggers. They describe the
    // restore process, not source history, so replace them with the snapshot.
    const { error: restoreRevisionCleanupError } = await client
      .from("operational_revisions")
      .delete()
      .eq("org_id", targetOrgId);
    if (restoreRevisionCleanupError) throw restoreRevisionCleanupError;
    const operationalRevisions = rowsOf(data, "operational_revisions")
      .map((row) => {
        const entityId = revisionEntityMaps[String(row.entity_type)]?.get(String(row.entity_id));
        if (!entityId) return null;
        return {
          ...row,
          id: crypto.randomUUID(),
          org_id: targetOrgId,
          entity_id: entityId,
          changed_by: mapId(userMap, row.changed_by),
        };
      })
      .filter(Boolean) as JsonRow[];
    restoredCounts.operational_revisions = await insertRows(client, "operational_revisions", operationalRevisions);

    const administrativeAudit = rowsOf(data, "administrative_audit_events").map((row) => {
      const targetType = String(row.target_type ?? "");
      let targetId = row.target_id ?? null;
      if (targetType === "membership") targetId = mapId(membershipMap, row.target_id);
      else if (targetType === "area") targetId = mapId(areaMap, row.target_id);
      else if (targetType === "organization" || targetId === sourceOrganization.id) targetId = targetOrgId;
      else if (targetType === "organization_backup") targetId = null;
      return {
        ...row,
        id: crypto.randomUUID(),
        org_id: targetOrgId,
        actor_user_id: mapId(userMap, row.actor_user_id),
        target_user_id: mapId(userMap, row.target_user_id),
        target_id: targetId,
        request_id: `restore:${String(row.id)}`,
      };
    });
    restoredCounts.administrative_audit_events = await insertRows(client, "administrative_audit_events", administrativeAudit);

    const recoveryIncidents = rowsOf(data, "organization_recovery_incidents").map((row) => ({
      ...row,
      id: crypto.randomUUID(),
      org_id: targetOrgId,
      opened_by: mapId(userMap, row.opened_by),
      resolved_by: mapId(userMap, row.resolved_by),
      request_id: `restore:${String(row.id)}`,
    }));
    restoredCounts.organization_recovery_incidents = await insertRows(
      client,
      "organization_recovery_incidents",
      recoveryIncidents,
    );

    const aiSettings = rowsOf(data, "ai_settings").map((row) => ({
      ...row,
      org_id: targetOrgId,
      has_key: false,
      key_preview: null,
    }));
    restoredCounts.ai_settings = await insertRows(client, "ai_settings", aiSettings);

    const aiFunctionSettings = rowsOf(data, "ai_function_settings").map((row) => ({
      ...row,
      org_id: targetOrgId,
      last_status: "no_key",
      last_status_detail: "Informe novamente a chave após a restauração.",
      last_status_source: null,
      last_checked_at: null,
    }));
    restoredCounts.ai_function_settings = await insertRows(client, "ai_function_settings", aiFunctionSettings);

    const aiUsageLogs = rowsOf(data, "ai_usage_logs").map((row) => ({
      ...row,
      id: crypto.randomUUID(),
      org_id: targetOrgId,
    }));
    restoredCounts.ai_usage_logs = await insertRows(client, "ai_usage_logs", aiUsageLogs);

    const aiControlPolicies = rowsOf(data, "ai_control_policies").map((row) => ({
      ...row,
      org_id: targetOrgId,
      enforcement_mode: "monitor",
      updated_by: mapId(userMap, row.updated_by),
    }));
    restoredCounts.ai_control_policies = await insertRows(client, "ai_control_policies", aiControlPolicies);

    const aiLimitEvents = rowsOf(data, "ai_limit_events").map((row) => ({
      ...row,
      id: crypto.randomUUID(),
      org_id: targetOrgId,
      user_id: mapId(userMap, row.user_id),
    }));
    restoredCounts.ai_limit_events = await insertRows(client, "ai_limit_events", aiLimitEvents);

    const whatsappSettings = rowsOf(data, "whatsapp_settings").map((row) => ({
      ...row,
      org_id: targetOrgId,
      enabled: false,
      inbound_queue_enabled: false,
      outbound_outbox_enabled: false,
      has_api_key: false,
      key_preview: null,
      has_webhook_secret: false,
      webhook_secret_preview: null,
    }));
    restoredCounts.whatsapp_settings = await insertRows(client, "whatsapp_settings", whatsappSettings);

    const orgTone = rowsOf(data, "org_ai_tone").map((row) => ({
      ...row,
      org_id: targetOrgId,
      updated_by: mapId(userMap, row.updated_by),
    }));
    restoredCounts.org_ai_tone = await insertRows(client, "org_ai_tone", orgTone);

    const sourcePolicy = rowsOf(data, "organization_backup_policies")[0];
    if (sourcePolicy) {
      const { error } = await client
        .from("organization_backup_policies")
        .update({
          automatic_enabled: sourcePolicy.automatic_enabled,
          event_snapshots_enabled: sourcePolicy.event_snapshots_enabled,
          event_retention_days: sourcePolicy.event_retention_days,
          daily_retention_days: sourcePolicy.daily_retention_days,
          weekly_retention_days: sourcePolicy.weekly_retention_days,
          monthly_retention_days: sourcePolicy.monthly_retention_days,
          last_success_at: null,
          last_failure_at: null,
          last_failure_message: null,
        })
        .eq("org_id", targetOrgId);
      if (error) throw error;
    }
    restoredCounts.organization_backup_policies = 1;

    await client.from("organization_backup_requests").delete().eq("org_id", targetOrgId);
    verification = await verifyRestoredOrganization(
      client,
      targetOrgId,
      envelope.payload.manifest.recordCounts,
      restoredCounts,
    );
    if (verification.passed !== true) {
      throw new Error("A verificação automática da restauração encontrou divergências");
    }
    const uniqueWarnings = [...new Set(warnings)];
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    await client
      .from("organization_restore_runs")
      .update({
        status: "completed",
        record_counts: restoredCounts,
        warnings: uniqueWarnings,
        duration_ms: durationMs,
        verification,
        completed_at: new Date().toISOString(),
      })
      .eq("id", restoreRun.id);
    return {
      restoreRunId: restoreRun.id,
      targetOrgId,
      targetOrgName,
      recordCounts: restoredCounts,
      warnings: uniqueWarnings,
      sourceKind,
      durationMs,
      verification,
    };
  } catch (error) {
    const message = errorMessage(error);
    await client.from("organizations").delete().eq("id", targetOrgId);
    await client
      .from("organization_restore_runs")
      .update({
        status: "failed",
        error_message: message,
        duration_ms: Math.max(0, Math.round(performance.now() - startedAt)),
        verification,
        completed_at: new Date().toISOString(),
      })
      .eq("id", restoreRun.id);
    throw error;
  }
}

export async function deleteOrganizationBackup(orgId: string, backupId: string) {
  const client = serviceClient();
  const backup = await backupRow(orgId, backupId);
  const { error: storageError } = await client.storage.from(STORAGE_BUCKET).remove([backup.object_path]);
  if (storageError) throw storageError;
  const { error } = await client.from("organization_backups").delete().eq("id", backupId).eq("org_id", orgId);
  if (error) throw error;
}

// External replicas are append-only disaster copies. Product lifecycle operations
// remove only internal storage; the provider's retention policy owns expiration.
export async function purgeOrganizationBackupObjects(
  objects: Array<{ object_path?: string | null }>,
) {
  const client = serviceClient();
  const paths = objects.map((item) => item.object_path).filter((path): path is string => Boolean(path));
  if (paths.length) {
    const { error } = await client.storage.from(STORAGE_BUCKET).remove(paths);
    if (error) throw error;
  }
}

export async function cleanupExpiredOrganizationBackups(orgId: string) {
  const client = serviceClient();
  const { data, error } = await client
    .from("organization_backups")
    .select("id,object_path")
    .eq("org_id", orgId)
    .eq("status", "completed")
    .not("expires_at", "is", null)
    .lt("expires_at", new Date().toISOString());
  if (error) throw error;
  for (const backup of data ?? []) {
    if (backup.object_path) await client.storage.from(STORAGE_BUCKET).remove([backup.object_path]);
    await client.from("organization_backups").delete().eq("id", backup.id);
  }
}

function localParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const dateKey = `${value("year")}-${value("month")}-${value("day")}`;
  return { dateKey, day: Number(value("day")), hour: Number(value("hour")) };
}

function scheduledKind(dateKey: string, day: number): BackupKind {
  if (day === 1) return "monthly";
  const weekday = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
  return weekday === 1 ? "weekly" : "daily";
}

export async function processOrganizationBackupCron() {
  const client = serviceClient();
  const { data: policies, error } = await client.from("organization_backup_policies").select("*");
  if (error) throw error;
  const summary = { checked: 0, created: 0, failed: 0, errors: [] as string[] };
  const nowParts = localParts();

  for (const rawPolicy of policies ?? []) {
    const policy = rawPolicy as BackupPolicy;
    summary.checked += 1;
    try {
      await cleanupExpiredOrganizationBackups(policy.org_id);
      const { data: request } = await client
        .from("organization_backup_requests")
        .select("requested_at")
        .eq("org_id", policy.org_id)
        .maybeSingle();
      const { data: recentScheduled } = await client
        .from("organization_backups")
        .select("created_at")
        .eq("org_id", policy.org_id)
        .eq("status", "completed")
        .in("kind", ["daily", "weekly", "monthly"])
        .gte("created_at", new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString());
      const alreadyScheduledToday = (recentScheduled ?? []).some(
        (backup) => localParts(new Date(backup.created_at)).dateKey === nowParts.dateKey,
      );
      const dueScheduled = policy.automatic_enabled && nowParts.hour >= 3 && !alreadyScheduledToday;

      if (dueScheduled) {
        await createOrganizationBackup(policy.org_id, scheduledKind(nowParts.dateKey, nowParts.day), null);
        await client.from("organization_backup_requests").delete().eq("org_id", policy.org_id);
        summary.created += 1;
      } else if (request && policy.event_snapshots_enabled) {
        await createOrganizationBackup(policy.org_id, "event", null);
        await client.from("organization_backup_requests").delete().eq("org_id", policy.org_id);
        summary.created += 1;
      }
    } catch (itemError) {
      summary.failed += 1;
      summary.errors.push(`${policy.org_id}: ${errorMessage(itemError)}`);
    }
  }
  return summary;
}
