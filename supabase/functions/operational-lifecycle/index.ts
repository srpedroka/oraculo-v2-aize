import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertAreaWriter, assertOwner, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const ENTITY_TYPES = [
  "objective",
  "key_action",
  "strategic_project",
  "evidence",
  "check_in",
  "plan_document",
] as const;

type EntityType = typeof ENTITY_TYPES[number];

function asText(value: unknown, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function asEntityType(value: unknown): EntityType {
  const candidate = asText(value, 40) as EntityType;
  if (!ENTITY_TYPES.includes(candidate)) throw new Error("Tipo operacional inválido");
  return candidate;
}

async function objectiveArea(client: ReturnType<typeof serviceClient>, orgId: string, objectiveId: string) {
  const { data, error } = await client
    .from("objectives")
    .select("id, area_id")
    .eq("id", objectiveId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Objetivo não encontrado");
  return data.area_id as string | null;
}

async function assertObjectivePermission(
  client: ReturnType<typeof serviceClient>,
  userId: string,
  orgId: string,
  entityId: string,
  archived: boolean,
) {
  const { data, error } = await client
    .from("objectives")
    .select("id, area_id, parent_id, archive_batch_id")
    .eq("id", entityId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Objetivo não encontrado");

  if (!archived && data.archive_batch_id) {
    const { data: batchRows, error: batchError } = await client
      .from("objectives")
      .select("id, area_id, parent_id")
      .eq("org_id", orgId)
      .eq("archive_batch_id", data.archive_batch_id);
    if (batchError) throw batchError;
    const batchIds = new Set((batchRows ?? []).map((row) => row.id));
    const root = (batchRows ?? []).find((row) => !row.parent_id || !batchIds.has(row.parent_id));
    if (root && root.id !== entityId) throw new Error("Restaure pelo objetivo principal deste grupo");
    await assertAreaWriter(userId, orgId, (root?.area_id ?? data.area_id) as string | null);
    return;
  }

  await assertAreaWriter(userId, orgId, data.area_id as string | null);
}

async function assertDependentPermission(
  client: ReturnType<typeof serviceClient>,
  userId: string,
  orgId: string,
  table: "key_actions" | "evidences",
  entityId: string,
  archived: boolean,
) {
  const { data, error } = await client
    .from(table)
    .select("objective_id, archive_batch_id")
    .eq("id", entityId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(table === "key_actions" ? "Ação não encontrada" : "Evidência não encontrada");

  if (!archived && data.archive_batch_id) {
    const { count, error: countError } = await client
      .from("objectives")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("archive_batch_id", data.archive_batch_id);
    if (countError) throw countError;
    if ((count ?? 0) > 0) throw new Error("Restaure este registro pelo objetivo arquivado");
  }

  await assertAreaWriter(userId, orgId, await objectiveArea(client, orgId, data.objective_id));
}

async function assertPermission(
  client: ReturnType<typeof serviceClient>,
  userId: string,
  orgId: string,
  entityType: EntityType,
  entityId: string,
  archived: boolean,
) {
  if (entityType === "objective") {
    await assertObjectivePermission(client, userId, orgId, entityId, archived);
    return;
  }

  if (entityType === "key_action" || entityType === "evidence") {
    await assertDependentPermission(client, userId, orgId, entityType === "key_action" ? "key_actions" : "evidences", entityId, archived);
    return;
  }

  if (entityType === "strategic_project") {
    const { data, error } = await client.from("strategic_projects").select("id").eq("id", entityId).eq("org_id", orgId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Projeto não encontrado");
    await assertOwner(userId, orgId);
    return;
  }

  const table = entityType === "check_in" ? "check_ins" : "plan_documents";
  const { data, error } = await client.from(table).select("id, area_id").eq("id", entityId).eq("org_id", orgId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(entityType === "check_in" ? "Check-in não encontrado" : "Documento não encontrado");
  await assertAreaWriter(userId, orgId, data.area_id as string | null);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const user = await getUser(req);
    const payload = await req.json();
    const orgId = asText(payload.orgId, 80);
    const entityId = asText(payload.entityId, 80);
    const entityType = asEntityType(payload.entityType);
    const archived = payload.archived === true;
    const reason = asText(payload.reason);
    if (!orgId || !entityId) throw new Error("Empresa e registro são obrigatórios");

    const client = serviceClient();
    await assertPermission(client, user.id, orgId, entityType, entityId, archived);

    const { data, error } = await client.rpc("set_operational_item_archived", {
      p_org_id: orgId,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_archived: archived,
      p_actor_id: user.id,
      p_reason: reason || null,
    });
    if (error) throw error;

    return jsonResponse({ result: data });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Não foi possível atualizar o registro" }, 400);
  }
});
