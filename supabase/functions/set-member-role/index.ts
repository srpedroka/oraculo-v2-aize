import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertCriticalActionAal2, assertOwner, getUser, isMfaRequiredError, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type MembershipRole = "owner" | "admin" | "coordinator";
type EditableRole = "admin" | "coordinator";

function parseEditableRole(value: unknown): EditableRole {
  if (value === "admin" || value === "coordinator") return value;
  if (value === "owner") throw new Error("Este fluxo não promove novos donos da empresa");
  throw new Error("Papel inválido");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await getUser(req);
    const { orgId, membershipId, role } = await req.json();
    if (!orgId || !membershipId) return jsonResponse({ error: "Empresa e membro são obrigatórios" }, 400);

    const nextRole = parseEditableRole(role);
    await assertOwner(user.id, orgId);
    await assertCriticalActionAal2(req, orgId);

    const client = serviceClient();
    const { data: targetMembership, error: targetError } = await client
      .from("memberships")
      .select("id, org_id, user_id, role")
      .eq("id", membershipId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (targetError) throw targetError;
    if (!targetMembership) return jsonResponse({ error: "Membro não encontrado" }, 404);

    const currentRole = targetMembership.role as MembershipRole;
    if (currentRole === nextRole) return jsonResponse({ ok: true, role: nextRole });

    if (currentRole === "owner") {
      const { count, error: countError } = await client
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("role", "owner");
      if (countError) throw countError;
      if ((count ?? 0) <= 1) {
        return jsonResponse({ error: "Não é possível rebaixar o último dono da empresa" }, 400);
      }
    }

    const { error: updateError } = await client
      .from("memberships")
      .update({ role: nextRole })
      .eq("id", membershipId)
      .eq("org_id", orgId);

    if (updateError) throw updateError;
    return jsonResponse({ ok: true, role: nextRole });
  } catch (error) {
    if (isMfaRequiredError(error)) return jsonResponse({ error: error.message, code: error.code }, 403);
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro ao alterar papel do membro" }, 400);
  }
});
