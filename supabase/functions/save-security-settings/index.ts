import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  assertAal2,
  assertOwner,
  getUser,
  isMfaRequiredError,
  serviceClient,
} from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { recordAdministrativeAudit } from "../_shared/administrative-audit.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const user = await getUser(req);
    const body = await req.json();
    const orgId = String(body.orgId ?? "").trim();
    if (!orgId) return jsonResponse({ error: "Empresa obrigatória" }, 400);
    if (typeof body.requireMfaForCriticalActions !== "boolean") {
      return jsonResponse({ error: "Política de MFA inválida" }, 400);
    }

    await assertOwner(user.id, orgId);
    const client = serviceClient();
    const { data: current, error: currentError } = await client
      .from("organization_security_settings")
      .select("require_mfa_for_critical_actions")
      .eq("org_id", orgId)
      .maybeSingle();
    if (currentError) throw currentError;

    const enabled = body.requireMfaForCriticalActions;
    if (Boolean(current?.require_mfa_for_critical_actions) === enabled) {
      return jsonResponse({ ok: true, requireMfaForCriticalActions: enabled });
    }

    // Changing the policy itself is a critical action. A verified factor and
    // an AAL2 session are required before either enabling or disabling it.
    await assertAal2(req);
    const now = new Date().toISOString();
    const { error } = await client.from("organization_security_settings").upsert({
      org_id: orgId,
      require_mfa_for_critical_actions: enabled,
      enabled_at: enabled ? now : null,
      enabled_by: enabled ? user.id : null,
      updated_at: now,
    });
    if (error) throw error;

    await recordAdministrativeAudit(client, req, {
      orgId,
      actorUserId: user.id,
      category: "security",
      action: "mfa_policy_updated",
      targetType: "organization_security",
      targetId: orgId,
      targetLabel: "Ações críticas",
      before: { requireMfaForCriticalActions: Boolean(current?.require_mfa_for_critical_actions) },
      after: { requireMfaForCriticalActions: enabled },
    });

    return jsonResponse({ ok: true, requireMfaForCriticalActions: enabled });
  } catch (error) {
    if (isMfaRequiredError(error)) {
      return jsonResponse({ error: error.message, code: error.code }, 403);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro ao salvar segurança" }, 400);
  }
});
