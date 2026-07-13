import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertCriticalActionAal2, assertOwner, getUser, isMfaRequiredError, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

function integerInRange(value: unknown, min: number, max: number, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${label} inválido`);
  return parsed;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const user = await getUser(req);
    const body = await req.json();
    const orgId = String(body.orgId ?? "").trim();
    if (!orgId) return jsonResponse({ error: "Empresa obrigatória" }, 400);
    await assertOwner(user.id, orgId);
    await assertCriticalActionAal2(req, orgId);

    const personCallsPerMinute = integerInRange(body.personCallsPerMinute, 1, 300, "Limite por pessoa");
    const orgCallsPerMinute = integerInRange(body.orgCallsPerMinute, 1, 3000, "Limite da empresa");
    const monthlyBudgetUsd = Number(body.monthlyBudgetUsd);
    if (!Number.isFinite(monthlyBudgetUsd) || monthlyBudgetUsd < 1 || monthlyBudgetUsd > 1_000_000) {
      throw new Error("Orçamento mensal inválido");
    }
    const enforcementMode = body.enforcementMode === "block" ? "block" : "monitor";

    const client = serviceClient();
    const { data, error } = await client.from("ai_control_policies").upsert({
      org_id: orgId,
      person_calls_per_minute: personCallsPerMinute,
      org_calls_per_minute: orgCallsPerMinute,
      monthly_budget_usd: monthlyBudgetUsd,
      enforcement_mode: enforcementMode,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }).select("*").single();
    if (error) throw error;
    return jsonResponse({ ok: true, policy: data });
  } catch (error) {
    if (isMfaRequiredError(error)) return jsonResponse({ error: error.message, code: error.code }, 403);
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro ao salvar limites de IA" }, 400);
  }
});

