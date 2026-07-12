import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertAreaWriter, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { runInTransaction } from "../_shared/tx-runner.ts";

// Fatia 1D — salvar o CONJUNTO de vínculos objetivo-KPI de forma atômica.
// Substitui o "upsert dos novos + remove os que saíram" (que hoje são 2 chamadas REST
// separadas) por uma única transação. Naturalmente idempotente (salvar o mesmo conjunto
// de novo dá o mesmo resultado). Preserva o created_at dos vínculos mantidos (a UI
// ordena os KPIs por created_at), por isso usa upsert+prune, não apagar+reinserir.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const user = await getUser(req);
    const body = await req.json();
    const orgId = String(body.orgId ?? "").trim();
    const objectiveId = String(body.objectiveId ?? "").trim();
    const links = Array.isArray(body.links) ? (body.links as Array<{ kpiId?: unknown; rationale?: unknown; confidence?: unknown }>) : [];
    if (!orgId || !objectiveId) return jsonResponse({ error: "Empresa e objetivo obrigatórios" }, 400);

    // O objetivo precisa existir na org; a permissão é pela área dele.
    const rest = serviceClient();
    const { data: objective, error: objError } = await rest
      .from("objectives").select("id, area_id, org_id").eq("id", objectiveId).eq("org_id", orgId).maybeSingle();
    if (objError) throw objError;
    if (!objective) throw new Error("Objetivo não encontrado");
    await assertAreaWriter(user.id, orgId, objective.area_id ?? null);

    // Deduplica por kpiId (last-write-wins): um kpiId repetido no payload quebraria o
    // upsert (ON CONFLICT não pode afetar a mesma linha duas vezes).
    const byKpi = new Map<string, { kpiId: string; rationale: string; confidence: number }>();
    for (const l of links) {
      const kpiId = String(l.kpiId ?? "").trim();
      if (kpiId) byKpi.set(kpiId, { kpiId, rationale: String(l.rationale ?? ""), confidence: Number(l.confidence ?? 1) });
    }
    const validLinks = [...byKpi.values()];
    const keepIds = validLinks.map((l) => l.kpiId);

    // Revalida no servidor (a conexão de serviço ignora RLS): cada KPI vinculado precisa
    // pertencer a ESTA empresa — checagem que a policy RLS fazia e que não pode se perder.
    if (keepIds.length) {
      const { data: orgKpis, error: kpiError } = await rest.from("executive_kpis").select("id").eq("org_id", orgId).in("id", keepIds);
      if (kpiError) throw kpiError;
      const known = new Set((orgKpis ?? []).map((k: { id: string }) => k.id));
      if (keepIds.some((id) => !known.has(id))) throw new Error("KPI inválido para esta empresa");
    }

    await runInTransaction(async (tx) => {
      if (validLinks.length) {
        const rows = validLinks.map((l) => ({
          org_id: orgId,
          objective_id: objectiveId,
          kpi_id: l.kpiId,
          rationale: l.rationale,
          confidence: Number.isFinite(l.confidence) ? Math.max(0, Math.min(1, l.confidence)) : 1,
          created_by: user.id,
        }));
        const { error: upsertError } = await tx.from("objective_kpi_links").upsert(rows, { onConflict: "objective_id,kpi_id" });
        if (upsertError) throw upsertError;
        const { error: pruneError } = await tx
          .from("objective_kpi_links").delete()
          .eq("org_id", orgId).eq("objective_id", objectiveId).notIn("kpi_id", keepIds, "uuid");
        if (pruneError) throw pruneError;
      } else {
        const { error: deleteError } = await tx
          .from("objective_kpi_links").delete().eq("org_id", orgId).eq("objective_id", objectiveId);
        if (deleteError) throw deleteError;
      }
      return null;
    });

    return jsonResponse({ ok: true, count: keepIds.length });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro ao salvar vínculos de KPI" }, 400);
  }
});
