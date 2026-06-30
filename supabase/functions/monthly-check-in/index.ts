import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertAreaWriter, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await getUser(req);
    const { orgId, areaId, period = "Set 2026" } = await req.json();
    if (!orgId || !areaId) return jsonResponse({ error: "Empresa e área são obrigatórias" }, 400);

    await assertAreaWriter(user.id, orgId, areaId);
    const client = serviceClient();

    const { data: area } = await client.from("areas").select("name").eq("id", areaId).eq("org_id", orgId).maybeSingle();
    const { data: objectives, error: objectivesError } = await client
      .from("objectives")
      .select("*")
      .eq("org_id", orgId)
      .eq("area_id", areaId)
      .eq("level", "monthly")
      .eq("period", period)
      .order("created_at");
    if (objectivesError) throw objectivesError;

    const objectiveIds = (objectives ?? []).map((objective) => objective.id);
    const [{ data: actions }, { data: evidences }] = await Promise.all([
      objectiveIds.length
        ? client.from("key_actions").select("*").eq("org_id", orgId).in("objective_id", objectiveIds)
        : Promise.resolve({ data: [] }),
      objectiveIds.length
        ? client.from("evidences").select("*").eq("org_id", orgId).in("objective_id", objectiveIds)
        : Promise.resolve({ data: [] }),
    ]);

    const late = (objectives ?? []).filter((objective) => objective.status === "late").length;
    const atRisk = (objectives ?? []).filter((objective) => objective.status === "at_risk").length;
    const onTrack = (objectives ?? []).filter((objective) => objective.status === "on_track").length;
    const summary = (objectives ?? []).length
      ? `${period} · ${area?.name ?? "Área"}: ${onTrack} no prazo, ${atRisk} em risco e ${late} atrasado. ${evidences?.length ?? 0} evidência(s) registrada(s), ${actions?.length ?? 0} ação(ões)-chave acompanhada(s). Próximo passo: atualizar progresso e evidência dos pontos críticos.`
      : `${period} · ${area?.name ?? "Área"} ainda não tem objetivos mensais. Crie o primeiro objetivo com o Oráculo antes do fechamento.`;

    const { data: checkIn, error: checkInError } = await client
      .from("check_ins")
      .insert({
        org_id: orgId,
        area_id: areaId,
        period,
        summary,
        created_by: user.id,
      })
      .select("*")
      .single();
    if (checkInError) throw checkInError;

    await client.from("chat_messages").insert({
      org_id: orgId,
      area_id: areaId,
      author: "oracle",
      text: summary,
    });

    return jsonResponse({ checkIn });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro no check-in mensal" }, 400);
  }
});
