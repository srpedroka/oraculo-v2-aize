import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertAreaWriter, getUser, serviceClient } from "../_shared/auth.ts";
import { resolveAiFunction } from "../_shared/ai-router.ts";
import { callModelForFunction } from "../_shared/call-for-function.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { parseJsonObject } from "../_shared/json.ts";
import { recordAiUsage } from "../_shared/usage.ts";

function text(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function clampConfidence(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0;
}

function heuristicSuggestions(objectiveText: string, kpis: any[]) {
  const normalized = objectiveText.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const patterns: Record<string, RegExp> = {
    revenue: /(fatur|receita|venda|cliente|contrat|ticket|pipeline)/,
    operating_margin: /(margem|custo|despesa|perda|eficien|retrabalho|rentab)/,
    production: /(produc|produtiv|entrega|capacidade|volume|fabrica|operacao)/,
    cash: /(caixa|fluxo|capital de giro|inadimpl|cobranca|liquidez)/,
  };
  return kpis
    .filter((kpi) => patterns[kpi.kpi_key]?.test(normalized))
    .slice(0, 2)
    .map((kpi) => ({
      kpiId: kpi.id,
      kpiKey: kpi.kpi_key,
      label: kpi.label,
      rationale: "O resultado esperado menciona um direcionador diretamente relacionado a este indicador.",
      confidence: 0.62,
    }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const user = await getUser(req);
    const payload = await req.json();
    const orgId = text(payload.orgId, 80);
    const objectiveId = text(payload.objectiveId, 80);
    if (!orgId || !objectiveId) throw new Error("Empresa e objetivo são obrigatórios");

    const client = serviceClient();
    const { data: objective, error: objectiveError } = await client
      .from("objectives")
      .select("id, org_id, area_id, level, type, title, result, metric, target, period")
      .eq("id", objectiveId)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .maybeSingle();
    if (objectiveError) throw objectiveError;
    if (!objective) throw new Error("Objetivo não encontrado");
    await assertAreaWriter(user.id, orgId, objective.area_id ?? null);

    const { data: kpis, error: kpiError } = await client
      .from("executive_kpis")
      .select("id, kpi_key, label, direction, unit")
      .eq("org_id", orgId)
      .order("sort_order");
    if (kpiError) throw kpiError;
    if (!(kpis ?? []).length) return jsonResponse({ suggestions: [], source: "none" });

    const objectiveText = [objective.title, objective.result, objective.metric, objective.target].filter(Boolean).join(" | ");
    const aiRoute = await resolveAiFunction(client, orgId, "background");
    if (!aiRoute) return jsonResponse({ suggestions: heuristicSuggestions(objectiveText, kpis ?? []), source: "heuristic" });

    const allowed = (kpis ?? []).map((kpi: any) => `${kpi.kpi_key}: ${kpi.label}`).join("\n");
    const systemPrompt = [
      "Você analisa se um objetivo de gestão pode influenciar diretamente algum KPI executivo existente.",
      "Sugira zero, um ou no máximo dois KPIs. Prefira não sugerir a criar uma relação fraca.",
      "Não invente KPI, ID, número, causalidade garantida nem resultado. Explique o possível impacto em uma frase curta.",
      "KPIs permitidos:",
      allowed,
      'Responda somente JSON válido: {"suggestions":[{"kpiKey":"revenue|operating_margin|production|cash","rationale":"frase curta","confidence":0.0}]}',
    ].join("\n");
    const userPrompt = [
      `Nível: ${objective.level}`,
      `Tipo: ${objective.type}`,
      `Período: ${objective.period}`,
      `Objetivo: ${objective.title}`,
      `Resultado esperado: ${objective.result || "não informado"}`,
      `Indicador próprio: ${objective.metric || "não informado"}`,
      `Meta: ${objective.target || "não informada"}`,
    ].join("\n");

    const result = await callModelForFunction(client, orgId, "background", aiRoute, systemPrompt, [{ role: "user", content: userPrompt }], aiRoute.limits);
    await recordAiUsage({
      client,
      orgId,
      provider: aiRoute.provider,
      model: aiRoute.model,
      channel: "web",
      usage: result.usage,
      settings: aiRoute.legacySettings,
      metadata: { aiFunction: "background", action: "objective_kpi_suggestion", objectiveId },
    });

    const parsed = parseJsonObject(result.text) as any;
    const byKey = new Map((kpis ?? []).map((kpi: any) => [kpi.kpi_key, kpi]));
    const seen = new Set<string>();
    const suggestions = (Array.isArray(parsed?.suggestions) ? parsed.suggestions : [])
      .map((item: any) => {
        const kpi = byKey.get(text(item?.kpiKey, 40));
        if (!kpi || seen.has(kpi.id)) return null;
        const confidence = clampConfidence(item?.confidence);
        if (confidence < 0.58) return null;
        seen.add(kpi.id);
        return {
          kpiId: kpi.id,
          kpiKey: kpi.kpi_key,
          label: kpi.label,
          rationale: text(item?.rationale, 240),
          confidence,
        };
      })
      .filter(Boolean)
      .slice(0, 2);

    return jsonResponse({ suggestions, source: "ai_background" });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Não foi possível sugerir KPIs" }, 400);
  }
});
