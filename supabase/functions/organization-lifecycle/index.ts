import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertCriticalActionAal2, assertOwner, getUser, isMfaRequiredError, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { purgeOrganizationBackupObjects } from "../_shared/organization-backup.ts";

// A completed backup must exist within this window before a permanent deletion.
// Daily automatic backups keep this satisfied; the danger zone lets the owner
// create a fresh one on demand.
const RECENT_BACKUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type Action = "leave" | "archive" | "restore" | "permanent_delete";

function asText(value: unknown, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function parseAreaReassignments(value: unknown) {
  if (value == null) return {} as Record<string, string | null>;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Reatribuições de área inválidas");
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([areaId, membershipId]) => {
      if (!areaId.trim()) throw new Error("Área inválida");
      if (membershipId == null || membershipId === "") return [areaId, null];
      if (typeof membershipId !== "string") throw new Error("Coordenador substituto inválido");
      return [areaId, membershipId];
    }),
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const user = await getUser(req);
    const payload = await req.json();
    const action = asText(payload.action, 40) as Action;
    const orgId = asText(payload.orgId, 80);
    const reason = asText(payload.reason) || null;
    if (!orgId) throw new Error("Empresa é obrigatória");

    const client = serviceClient();

    const { data: org, error: orgError } = await client
      .from("organizations")
      .select("id, name, archived_at")
      .eq("id", orgId)
      .maybeSingle();
    if (orgError) throw orgError;
    if (!org) return jsonResponse({ error: "Empresa não encontrada" }, 404);

    if (action === "leave") {
      const { data: membership, error: membershipError } = await client
        .from("memberships")
        .select("id, role")
        .eq("org_id", orgId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership) return jsonResponse({ error: "Você não faz parte desta empresa" }, 403);

      if (membership.role === "owner") {
        const { count, error: ownerError } = await client
          .from("memberships")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("role", "owner");
        if (ownerError) throw ownerError;
        if ((count ?? 0) <= 1) {
          throw new Error("Você é o único dono. Transfira a titularidade ou encerre a empresa antes de sair.");
        }
      }

      const { error: rpcError } = await client.rpc("remove_organization_member", {
        p_org_id: orgId,
        p_membership_id: membership.id,
        p_area_reassignments: parseAreaReassignments(payload.areaReassignments),
      });
      if (rpcError) throw rpcError;

      await client.from("organization_lifecycle_audit").insert({
        org_id: orgId,
        org_name: org.name,
        action: "leave",
        actor_user_id: user.id,
        actor_email: user.email ?? null,
        reason,
      });

      return jsonResponse({ ok: true });
    }

    // The remaining actions are owner-only.
    await assertOwner(user.id, orgId);

    if (action === "archive" || action === "permanent_delete") {
      await assertCriticalActionAal2(req, orgId);
    }

    if (action === "archive" || action === "restore") {
      const { data, error } = await client.rpc("set_organization_archived", {
        p_org_id: orgId,
        p_archived: action === "archive",
        p_actor_id: user.id,
        p_actor_email: user.email ?? null,
        p_reason: reason,
      });
      if (error) throw error;
      return jsonResponse({ ok: true, result: data });
    }

    if (action === "permanent_delete") {
      if (org.archived_at == null) {
        throw new Error("Arquive a empresa antes de excluir definitivamente");
      }

      const confirmName = asText(payload.confirmName, 200);
      if (confirmName !== org.name) {
        throw new Error("O nome digitado não confere com o da empresa");
      }

      const { data: recentBackup, error: backupError } = await client
        .from("organization_backups")
        .select("id, created_at, completed_at")
        .eq("org_id", orgId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (backupError) throw backupError;

      const backupStamp = recentBackup?.completed_at ?? recentBackup?.created_at ?? null;
      const backupAgeOk = backupStamp ? Date.now() - new Date(backupStamp).getTime() <= RECENT_BACKUP_WINDOW_MS : false;
      if (!recentBackup || !backupAgeOk) {
        throw new Error("Crie um backup completo recente antes de excluir definitivamente. Baixe o pacote portátil para guardar fora do sistema.");
      }

      // Read the stored objects BEFORE deleting the org — the organization_backups
      // rows cascade away with the organization, so we would lose the paths after.
      const { data: backupObjects, error: objectsError } = await client
        .from("organization_backups")
        .select("object_path")
        .eq("org_id", orgId);
      if (objectsError) throw objectsError;

      const { data, error } = await client.rpc("delete_organization_permanently", {
        p_org_id: orgId,
        p_actor_id: user.id,
        p_actor_email: user.email ?? null,
        p_confirm_name: confirmName,
        p_reason: reason,
      });
      if (error) throw error;

      // Storage has no cascade — clear it after the DB rows are gone.
      try {
        await purgeOrganizationBackupObjects(backupObjects ?? []);
      } catch (storageError) {
        console.error("organization-lifecycle: falha ao limpar storage de backups", storageError);
      }

      return jsonResponse({ ok: true, result: data });
    }

    return jsonResponse({ error: "Ação inválida" }, 400);
  } catch (error) {
    if (isMfaRequiredError(error)) return jsonResponse({ error: error.message, code: error.code }, 403);
    const message = error instanceof Error ? error.message : "Não foi possível concluir a operação";
    const status = /Sessão|autorizad|Apenas o dono|Sem acesso|não faz parte/.test(message) ? 401 : 400;
    return jsonResponse({ error: message }, status);
  }
});
