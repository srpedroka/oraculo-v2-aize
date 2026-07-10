import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertOrgMember, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { suggestHistoricalMetadata } from "../_shared/historical-classifier.ts";

const MAX_TEXT_LENGTH = 200_000;
const MAX_FILENAME_LENGTH = 180;

function asText(value: unknown, maxLength = 10_000) {
  return String(value ?? "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").trim().slice(0, maxLength);
}

async function loadCandidateAreas(client: ReturnType<typeof serviceClient>, params: { orgId: string; membership: { id: string; role: string } }) {
  let query = client
    .from("areas")
    .select("id, name, coordinator_id")
    .eq("org_id", params.orgId)
    .is("archived_at", null)
    .order("name");
  if (params.membership.role !== "owner") query = query.eq("coordinator_id", params.membership.id);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((area: { id: string; name: string }) => ({ id: area.id, name: area.name }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const user = await getUser(req);
    const payload = await req.json();
    const orgId = asText(payload.orgId, 80);
    const rawText = asText(payload.rawText, MAX_TEXT_LENGTH);
    const fileName = asText(payload.fileName, MAX_FILENAME_LENGTH) || null;

    if (!orgId) throw new Error("Empresa ausente");
    if (!rawText) throw new Error("Cole ou importe o texto do histórico");

    const client = serviceClient();
    const membership = await assertOrgMember(user.id, orgId);
    if (membership.role === "admin") throw new Error("Admin não pode importar histórico");

    const areas = await loadCandidateAreas(client, { orgId, membership });
    if (membership.role !== "owner" && !areas.length) throw new Error("Seu usuário precisa coordenar uma área para importar histórico");

    const suggestion = await suggestHistoricalMetadata(client, { orgId, rawText, fileName, areas });
    return jsonResponse({ suggestion });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Não foi possível interpretar o histórico" }, 400);
  }
});
