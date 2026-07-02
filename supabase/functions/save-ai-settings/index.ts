import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertOwner, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { resolveModelPricing } from "../_shared/pricing.ts";
import type { Provider } from "../_shared/model.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await getUser(req);
    const {
      orgId,
      provider = "openai",
      model = "gpt-5.4",
      apiKey = "",
      inputTokenPriceUsdPerMillion = 0,
      outputTokenPriceUsdPerMillion = 0,
      pricingSource = "",
    } = await req.json();
    if (!orgId) return jsonResponse({ error: "Empresa obrigatória" }, 400);

    await assertOwner(user.id, orgId);
    const client = serviceClient();
    const cleanKey = String(apiKey).trim();
    const keyPreview = cleanKey ? `****${cleanKey.slice(-4)}` : undefined;
    const knownPricing = await resolveModelPricing(provider as Provider, String(model));
    const inputPrice = knownPricing?.inputTokenPriceUsdPerMillion ?? Math.max(0, Number(inputTokenPriceUsdPerMillion) || 0);
    const outputPrice = knownPricing?.outputTokenPriceUsdPerMillion ?? Math.max(0, Number(outputTokenPriceUsdPerMillion) || 0);
    const source = knownPricing?.source ?? (String(pricingSource ?? "").trim() || null);

    if (cleanKey) {
      const { error: keyError } = await client.from("ai_model_keys").upsert({
        org_id: orgId,
        provider,
        api_key: cleanKey,
        updated_at: new Date().toISOString(),
      });
      if (keyError) throw keyError;
    }

    const { error: settingsError } = await client.from("ai_settings").upsert({
      org_id: orgId,
      provider,
      model,
      has_key: cleanKey ? true : undefined,
      key_preview: keyPreview,
      input_token_price_usd_per_million: inputPrice,
      output_token_price_usd_per_million: outputPrice,
      pricing_source: source,
      updated_at: new Date().toISOString(),
    });

    if (settingsError) throw settingsError;
    return jsonResponse({ ok: true, keyPreview });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro ao salvar IA" }, 400);
  }
});
