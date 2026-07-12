import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getUser } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { runInTransaction } from "../_shared/tx-runner.ts";
import { uuidFromToken } from "../_shared/tx-client.ts";

// Espelho de defaultExecutiveKpiRows do frontend (src/state/store.tsx). Mantido em
// sincronia: os 4 indicadores executivos padrao de toda empresa nova.
function defaultExecutiveKpiRows(orgId: string) {
  return [
    { org_id: orgId, kpi_key: "revenue", label: "Faturamento", unit: "currency", secondary_unit: null, direction: "higher_better", flow_type: "flow", is_ladder: false, ladder: [], sort_order: 10 },
    { org_id: orgId, kpi_key: "operating_margin", label: "Margem operacional", unit: "percent", secondary_unit: null, direction: "higher_better", flow_type: "flow", is_ladder: false, ladder: [], sort_order: 20 },
    { org_id: orgId, kpi_key: "production", label: "Produção", unit: "currency", secondary_unit: "count", direction: "higher_better", flow_type: "flow", is_ladder: false, ladder: [], sort_order: 30 },
    {
      org_id: orgId, kpi_key: "cash", label: "Caixa", unit: "currency", secondary_unit: null, direction: "higher_better", flow_type: "stock", is_ladder: true,
      ladder: [
        { key: "stop_bleed", label: "Estancar sangria", order: 1 },
        { key: "operational_zero", label: "Operacional >= 0", order: 2 },
        { key: "service_debt", label: "Aguentar a dívida", order: 3 },
        { key: "surplus", label: "Sobrar", order: 4 },
      ],
      sort_order: 40,
    },
  ];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const user = await getUser(req);
    const body = await req.json();
    const name = String(body.name ?? "").trim().slice(0, 200);
    const subtitle = String(body.subtitle ?? "").trim().slice(0, 200) || null;
    // "Número de recibo" da criação (token do cliente). Sem token: um por request.
    const token = String(body.token ?? "").trim().slice(0, 200) || crypto.randomUUID();
    if (!name) return jsonResponse({ error: "Nome da empresa obrigatório" }, 400);

    // Id deterministico a partir do token: duplo clique/retry da MESMA criacao => mesmo
    // id => dedup pela PK; nova criacao => token novo => id novo => nova empresa.
    const orgId = await uuidFromToken(token);

    // Tudo-ou-nada: organizacao + dono + ai_settings + 4 KPIs numa unica transacao.
    // Se qualquer passo falhar, a organizacao NAO existe. A politica de backup vem do
    // gatilho ensure_organization_backup_policy no insert da organizacao.
    const org = await runInTransaction(async (tx) => {
      const { data: inserted, error: orgError } = await tx
        .from("organizations")
        .upsert({ id: orgId, name, subtitle, created_by: user.id }, { onConflict: "id", ignoreDuplicates: true })
        .select("*");
      if (orgError) throw orgError;

      if (!inserted || inserted.length === 0) {
        // Já existe (mesma criação repetida). Confirma que é do próprio usuário e devolve
        // sem recriar nada (a criação anterior gravou tudo atomicamente).
        const { data: existing, error: existingError } = await tx.from("organizations").select("*").eq("id", orgId).single();
        if (existingError) throw existingError;
        if (!existing || existing.created_by !== user.id) throw new Error("Conflito de criação de empresa; tente novamente.");
        return existing;
      }

      const created = inserted[0];
      const { error: membershipError } = await tx.from("memberships").insert({ org_id: orgId, user_id: user.id, role: "owner" });
      if (membershipError) throw membershipError;
      const { error: aiSettingsError } = await tx.from("ai_settings").insert({ org_id: orgId });
      if (aiSettingsError) throw aiSettingsError;
      const { error: kpiError } = await tx.from("executive_kpis").insert(defaultExecutiveKpiRows(orgId));
      if (kpiError) throw kpiError;
      return created;
    });

    return jsonResponse({ org });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro ao criar empresa" }, 400);
  }
});
