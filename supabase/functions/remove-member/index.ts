import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertOwner, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { recordAdministrativeAudit } from "../_shared/administrative-audit.ts";

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

  try {
    const user = await getUser(req);
    const { orgId, membershipId, areaReassignments = {} } = await req.json();
    if (!orgId || !membershipId) return jsonResponse({ error: "Empresa e membro são obrigatórios" }, 400);

    await assertOwner(user.id, orgId);
    const client = serviceClient();
    const { data: targetMembership, error: targetError } = await client
      .from("memberships")
      .select("id, user_id, role")
      .eq("id", membershipId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (targetError) throw targetError;
    if (!targetMembership) return jsonResponse({ error: "Membro não encontrado" }, 404);
    if (targetMembership.user_id === user.id) {
      return jsonResponse({ error: "Use o fluxo de saída da empresa para remover o próprio acesso" }, 400);
    }

    const { data: coordinatedAreas, error: areasError } = await client
      .from("areas")
      .select("id,name")
      .eq("org_id", orgId)
      .eq("coordinator_id", membershipId);
    if (areasError) throw areasError;

    const { data, error } = await client.rpc("remove_organization_member", {
      p_org_id: orgId,
      p_membership_id: membershipId,
      p_area_reassignments: parseAreaReassignments(areaReassignments),
    });

    if (error) throw error;
    await recordAdministrativeAudit(client, req, {
      orgId,
      actorUserId: user.id,
      category: "people",
      action: "member_removed",
      targetType: "membership",
      targetId: membershipId,
      targetUserId: targetMembership.user_id,
      before: {
        role: targetMembership.role,
        areaIds: (coordinatedAreas ?? []).map((area) => area.id),
        areaNames: (coordinatedAreas ?? []).map((area) => area.name),
      },
      after: { access: "removed" },
      metadata: { reassignedAreaCount: Object.keys(parseAreaReassignments(areaReassignments)).length },
    });
    return jsonResponse({ ok: true, result: data });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro ao remover membro" }, 400);
  }
});
