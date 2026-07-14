import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertCriticalActionAal2, assertOwner, getUser, isMfaRequiredError, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { probeModel, type ProbeResult, type ProbeStatus } from "../_shared/model-probe.ts";
import { resolveModelPricing } from "../_shared/pricing.ts";
import type { Provider } from "../_shared/model.ts";
import type { AiFunction } from "../_shared/ai-router.ts";

const AI_FUNCTIONS: AiFunction[] = ["planning", "daily", "background"];
const PROVIDERS: Provider[] = ["openai", "anthropic", "moonshot", "xai"];
const DEFAULT_MODEL_BY_PROVIDER: Record<Provider, string> = {
  openai: "gpt-5.4",
  anthropic: "claude-sonnet-4-6",
  moonshot: "kimi-k2.7-code",
  xai: "grok-4.3",
};

type Client = ReturnType<typeof serviceClient>;

function asProvider(value: unknown): Provider {
  const text = String(value ?? "openai").trim() as Provider;
  return PROVIDERS.includes(text) ? text : "openai";
}

function asAiFunction(value: unknown): AiFunction | null {
  const text = String(value ?? "").trim() as AiFunction;
  return AI_FUNCTIONS.includes(text) ? text : null;
}

function cleanDetail(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
}

async function existingKey(client: Client, orgId: string, provider: Provider) {
  const { data, error } = await client
    .from("ai_model_keys")
    .select("api_key")
    .eq("org_id", orgId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw error;
  return String(data?.api_key ?? "").trim();
}

async function existingModelForProvider(client: Client, orgId: string, provider: Provider) {
  const { data: functionSetting, error } = await client
    .from("ai_function_settings")
    .select("model")
    .eq("org_id", orgId)
    .eq("provider", provider)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (functionSetting?.model) return String(functionSetting.model);

  const { data: legacy, error: legacyError } = await client
    .from("ai_settings")
    .select("model")
    .eq("org_id", orgId)
    .eq("provider", provider)
    .maybeSingle();
  if (legacyError) throw legacyError;
  return String(legacy?.model ?? DEFAULT_MODEL_BY_PROVIDER[provider]);
}

async function persistFunctionStatus(
  client: Client,
  orgId: string,
  aiFunction: AiFunction,
  status: ProbeStatus,
  detail: string,
  source: "save" | "manual",
  checkedAt: string,
) {
  const { error } = await client
    .from("ai_function_settings")
    .update({
      last_status: status,
      last_status_detail: cleanDetail(detail),
      last_status_source: source,
      last_checked_at: checkedAt,
    })
    .eq("org_id", orgId)
    .eq("function", aiFunction);
  if (error) throw error;
}

async function persistProviderStatus(
  client: Client,
  orgId: string,
  provider: Provider,
  status: ProbeStatus,
  detail: string,
  checkedAt: string,
  keyPreview?: string,
) {
  const row: Record<string, unknown> = {
    org_id: orgId,
    provider,
    has_key: status !== "no_key",
    last_status: status,
    last_status_detail: cleanDetail(detail),
    last_checked_at: checkedAt,
    updated_at: checkedAt,
  };
  if (keyPreview) row.key_preview = keyPreview;

  const { error } = await client.from("ai_provider_key_status").upsert(row, { onConflict: "org_id,provider" });
  if (error) throw error;
}

async function validateAndPersist(
  client: Client,
  params: {
    orgId: string;
    provider: Provider;
    model: string;
    apiKey: string;
    aiFunction?: AiFunction | null;
    keyPreview?: string;
    source: "save" | "manual";
  },
) {
  const checkedAt = new Date().toISOString();
  const result: ProbeResult = params.apiKey
    ? await probeModel(params.provider, params.model, params.apiKey)
    : { status: "no_key", detail: "Nenhuma chave cadastrada para este provedor." };

  if (params.aiFunction) {
    await persistFunctionStatus(client, params.orgId, params.aiFunction, result.status, result.detail, params.source, checkedAt);
  }
  await persistProviderStatus(client, params.orgId, params.provider, result.status, result.detail, checkedAt, params.keyPreview);

  return {
    scope: params.aiFunction ?? params.provider,
    provider: params.provider,
    model: params.model,
    status: result.status,
    httpStatus: result.httpStatus,
    detail: result.detail,
    checkedAt,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await getUser(req);
    const body = await req.json();
    const {
      orgId,
      function: requestedFunction,
      model,
      apiKey = "",
      inputTokenPriceUsdPerMillion = 0,
      outputTokenPriceUsdPerMillion = 0,
      pricingSource = "",
      mode = "save",
      validate = true,
      expectedUpdatedAt = null,
    } = body;
    if (!orgId) return jsonResponse({ error: "Empresa obrigatória" }, 400);

    await assertOwner(user.id, orgId);
    await assertCriticalActionAal2(req, orgId);
    const client = serviceClient();
    const providerValue = asProvider(body.provider);
    const aiFunction = asAiFunction(requestedFunction);
    if (requestedFunction && !aiFunction) return jsonResponse({ error: "Função de IA inválida" }, 400);

    const modelValue = String(model ?? "").trim();
    const cleanKey = String(apiKey).trim();
    const keyPreview = cleanKey ? `****${cleanKey.slice(-4)}` : undefined;
    const now = new Date().toISOString();
    const shouldValidate = validate !== false;

    if (mode === "test") {
      const testModel = modelValue || await existingModelForProvider(client, orgId, providerValue);
      const effectiveKey = cleanKey || await existingKey(client, orgId, providerValue);
      const validation = shouldValidate
        ? await validateAndPersist(client, {
          orgId,
          provider: providerValue,
          model: testModel,
          apiKey: effectiveKey,
          aiFunction,
          keyPreview,
          source: "manual",
        })
        : null;
      return jsonResponse({ ok: true, keyPreview, validation });
    }

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
      if (!modelValue) return jsonResponse({ error: "Modelo obrigatório" }, 400);

      const { data: savedFunction, error: fnError } = await client.rpc("save_ai_function_if_current", {
        p_org_id: orgId,
        p_function: aiFunction,
        p_expected_updated_at: expectedUpdatedAt ? String(expectedUpdatedAt) : null,
        p_provider: providerValue,
        p_model: modelValue,
      });
      if (fnError) throw fnError;
      if (!(savedFunction as { ok?: boolean } | null)?.ok) {
        return jsonResponse({ error: "Este dado mudou em outra sessão. Recarregue a versão atual antes de salvar novamente.", code: "CONFLICT_STALE_WRITE" }, 409);
      }

      const effectiveKey = cleanKey || await existingKey(client, orgId, providerValue);
      const validation = shouldValidate
        ? await validateAndPersist(client, {
          orgId,
          provider: providerValue,
          model: modelValue,
          apiKey: effectiveKey,
          aiFunction,
          keyPreview,
          source: "save",
        })
        : null;
      return jsonResponse({
        ok: true,
        keyPreview,
        validation,
        updatedAt: String((savedFunction as { updatedAt?: string } | null)?.updatedAt ?? now),
      });
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
      const probeModelValue = await existingModelForProvider(client, orgId, providerValue);
      const validation = shouldValidate
        ? await validateAndPersist(client, {
          orgId,
          provider: providerValue,
          model: probeModelValue,
          apiKey: cleanKey,
          keyPreview,
          source: "save",
        })
        : null;
      return jsonResponse({ ok: true, keyPreview, validation });
    }

    const finalModel = modelValue || DEFAULT_MODEL_BY_PROVIDER[providerValue];
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

    const effectiveKey = cleanKey || await existingKey(client, orgId, providerValue);
    const validation = shouldValidate
      ? await validateAndPersist(client, {
        orgId,
        provider: providerValue,
        model: finalModel,
        apiKey: effectiveKey,
        keyPreview,
        source: "save",
      })
      : null;

    return jsonResponse({ ok: true, keyPreview, validation });
  } catch (error) {
    if (isMfaRequiredError(error)) return jsonResponse({ error: error.message, code: error.code }, 403);
    if ((error as { code?: string; message?: string })?.code === "40001" || (error as { message?: string })?.message?.includes("CONFLICT_STALE_WRITE")) {
      return jsonResponse({ error: "Este dado mudou em outra sessão. Recarregue a versão atual antes de salvar novamente.", code: "CONFLICT_STALE_WRITE" }, 409);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro ao salvar IA" }, 400);
  }
});
