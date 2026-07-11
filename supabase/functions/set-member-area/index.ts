import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertOwner, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asText(value: unknown, max = 80) {
  return String(value ?? "").trim().slice(0, max);
}

function asUuid(value: unknown, label: string) {
  const text = asText(value, 80);
  if (!text || !UUID_RE.test(text)) throw new Error(`${label} inválido`);
  return text;
}

function asOptionalUuid(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  return asUuid(value, label);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const user = await getUser(req);
    const payload = await req.json();
    const orgId = asUuid(payload.orgId, "Empresa");
    const membershipId = asUuid(payload.membershipId, "Membro");
    const areaId = asOptionalUuid(payload.areaId, "Área");

    await assertOwner(user.id, orgId);

    const client = serviceClient();
    const { data, error } = await client.rpc("set_member_primary_area", {
      p_org_id: orgId,
      p_membership_id: membershipId,
      p_area_id: areaId,
    });
    if (error) throw error;

    const changedAreaIds = Array.isArray((data as { changedAreaIds?: unknown })?.changedAreaIds)
      ? ((data as { changedAreaIds: string[] }).changedAreaIds)
      : [];

    return jsonResponse({ ok: true, changedAreaIds, result: data });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Não foi possível alterar a área" }, 400);
  }
});
