import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertOwner, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { resolveModelPricing } from "../_shared/pricing.ts";
import type { Provider } from "../_shared/model.ts";
import type { AiFunction } from "../_shared/ai-router.ts";

const AI_FUNCTIONS: AiFunction[] = ["planning", "daily", "background"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await getUser(req);
    const {
      orgId,
      function: aiFunction,
      provider = "openai",
      model,
      apiKey = "",
      inputTokenPriceUsdPerMillion = 0,
      outputTokenPriceUsdPerMillion = 0,
      pricingSource = "",
    } = await req.json();
    if (!orgId) return jsonResponse({ error: "Empresa obrigatória" }, 400);

    await assertOwner(user.id, orgId);
    const client = serviceClient();
    const providerValue = String(provider) as Provider;
    const modelValue = String(model ?? "").trim();
    const cleanKey = String(apiKey).trim();
    const keyPreview = cleanKey ? `****${cleanKey.slice(-4)}` : undefined;
    const now = new Date().toISOString();

    if (cleanKey) {
      const { error: keyError } = await client.from("ai_model_keys").upsert(
        {
          org_id: orgId,
          provider: providerValue,
          api_key: cleanKey,
          updated_at: now,
        },
        { onConflict: "org_id,provider" },
      );
      if (keyError) throw keyError;

      const { error: keyStatusError } = await client.from("ai_provider_key_status").upsert(
        {
          org_id: orgId,
          provider: providerValue,
          has_key: true,
          key_preview: keyPreview,
          updated_at: now,
        },
        { onConflict: "org_id,provider" },
      );
      if (keyStatusError) throw keyStatusError;
    }

    if (aiFunction) {
      if (!AI_FUNCTIONS.includes(aiFunction)) return jsonResponse({ error: "Função de IA inválida" }, 400);
      if (!modelValue) return jsonResponse({ error: "Modelo obrigatório" }, 400);

      const { error: fnError } = await client.from("ai_function_settings").upsert(
        {
          org_id: orgId,
          function: aiFunction,
          provider: providerValue,
          model: modelValue,
          updated_at: now,
        },
        { onConflict: "org_id,function" },
      );
      if (fnError) throw fnError;
      return jsonResponse({ ok: true, keyPreview });
    }

    if (!modelValue && cleanKey) {
      const { data: legacy } = await client.from("ai_settings").select("provider").eq("org_id", orgId).maybeSingle();
      if (legacy?.provider === providerValue) {
        const { error: legacyKeyError } = await client
          .from("ai_settings")
          .update({ has_key: true, key_preview: keyPreview, updated_at: now })
          .eq("org_id", orgId);
        if (legacyKeyError) throw legacyKeyError;
      }
      return jsonResponse({ ok: true, keyPreview });
    }

    const finalModel = modelValue || "gpt-5.4";
    const { data: previousLegacy } = await client.from("ai_settings").select("provider, model").eq("org_id", orgId).maybeSingle();
    const knownPricing = await resolveModelPricing(providerValue, finalModel);
    const inputPrice = knownPricing?.inputTokenPriceUsdPerMillion ?? Math.max(0, Number(inputTokenPriceUsdPerMillion) || 0);
    const outputPrice = knownPricing?.outputTokenPriceUsdPerMillion ?? Math.max(0, Number(outputTokenPriceUsdPerMillion) || 0);
    const source = knownPricing?.source ?? (String(pricingSource ?? "").trim() || null);

    const { error: settingsError } = await client.from("ai_settings").upsert({
      org_id: orgId,
      provider: providerValue,
      model: finalModel,
      has_key: cleanKey ? true : undefined,
      key_preview: keyPreview,
      input_token_price_usd_per_million: inputPrice,
      output_token_price_usd_per_million: outputPrice,
      pricing_source: source,
      updated_at: now,
    });

    if (settingsError) throw settingsError;

    const { data: functionSettings } = await client
      .from("ai_function_settings")
      .select("function, provider, model")
      .eq("org_id", orgId);

    const rowsToMirror = AI_FUNCTIONS.filter((fn) => {
      const current = functionSettings?.find((item: { function: AiFunction }) => item.function === fn);
      if (!current) return true;
      if (!previousLegacy?.provider || !previousLegacy?.model) return true;
      return current.provider === previousLegacy.provider && current.model === previousLegacy.model;
    }).map((fn) => ({
      org_id: orgId,
      function: fn,
      provider: providerValue,
      model: finalModel,
      updated_at: now,
    }));

    if (rowsToMirror.length) {
      const { error: functionMirrorError } = await client
        .from("ai_function_settings")
        .upsert(rowsToMirror, { onConflict: "org_id,function" });
      if (functionMirrorError) throw functionMirrorError;
    }

    return jsonResponse({ ok: true, keyPreview });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro ao salvar IA" }, 400);
  }
});
