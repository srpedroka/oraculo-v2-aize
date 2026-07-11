import { serviceClient } from "./auth.ts";
import { type Provider } from "./model.ts";

export type AiFunction = "planning" | "daily" | "background";

export const FUNCTION_LIMITS: Record<AiFunction, { maxTokens: number; temperature: number }> = {
  planning: { maxTokens: 4000, temperature: 0.5 },
  daily: { maxTokens: 900, temperature: 0.6 },
  background: { maxTokens: 2000, temperature: 0.2 },
};

export async function resolveAiFunction(client: ReturnType<typeof serviceClient>, orgId: string, fn: AiFunction) {
  const { data: fnSettings } = await client
    .from("ai_function_settings")
    .select("provider, model")
    .eq("org_id", orgId)
    .eq("function", fn)
    .maybeSingle();

  const { data: legacy } = await client.from("ai_settings").select("*").eq("org_id", orgId).maybeSingle();
  const provider = (fnSettings?.provider ?? legacy?.provider) as Provider | undefined;
  const model = fnSettings?.model ?? legacy?.model;
  if (!provider || !model) return null;

  const { data: keyRow } = await client
    .from("ai_model_keys")
    .select("api_key")
    .eq("org_id", orgId)
    .eq("provider", provider)
    .maybeSingle();
  if (!keyRow?.api_key) return null;

  return { provider, model, apiKey: keyRow.api_key as string, limits: FUNCTION_LIMITS[fn], legacySettings: legacy };
}
