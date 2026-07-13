import type { AiFunction } from "./ai-router.ts";
import { callModel, callModelWithImage, type ModelCallOptions, type ModelImageInput } from "./model.ts";
import { classifyModelError, type ProbeStatus } from "./model-probe.ts";
import { evaluateAiControls, type AiControlContext } from "./ai-controls.ts";

type Client = any;

interface AiRoute {
  provider: "openai" | "anthropic" | "moonshot" | "xai";
  model: string;
  apiKey: string;
  limits: ModelCallOptions;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

function cleanDetail(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
}

async function recordFunctionError(client: Client, orgId: string, fn: AiFunction, aiRoute: AiRoute, status: ProbeStatus) {
  try {
    await client.from("ai_function_errors").insert({
      org_id: orgId,
      function: fn,
      provider: aiRoute.provider,
      model: aiRoute.model,
      error_code: status,
    });
  } catch {
    // Telemetry must never replace the original model failure.
  }
}

export async function markFunctionStatus(
  client: Client,
  orgId: string,
  fn: AiFunction,
  status: ProbeStatus,
  source: "save" | "manual" | "runtime",
  detail = "",
) {
  const { error } = await client
    .from("ai_function_settings")
    .update({
      last_status: status,
      last_status_detail: cleanDetail(detail),
      last_status_source: source,
      last_checked_at: new Date().toISOString(),
    })
    .eq("org_id", orgId)
    .eq("function", fn);
  if (error) console.error("Erro ao atualizar status da função de IA", error.message ?? error);
}

export async function callModelForFunction(
  client: Client,
  orgId: string,
  fn: AiFunction,
  aiRoute: AiRoute,
  systemPrompt: string,
  messages: Message[],
  options: ModelCallOptions = aiRoute.limits,
  controlContext: AiControlContext = {},
) {
  await evaluateAiControls(client, orgId, controlContext);
  try {
    const result = await callModel(aiRoute.provider, aiRoute.model, aiRoute.apiKey, systemPrompt, messages, options);
    await markFunctionStatus(client, orgId, fn, "ok", "runtime", "Último uso validado.");
    return result;
  } catch (error) {
    const classified = classifyModelError(error);
    await recordFunctionError(client, orgId, fn, aiRoute, classified.status);
    await markFunctionStatus(client, orgId, fn, classified.status, "runtime", classified.detail);
    throw error;
  }
}

export async function callModelWithImageForFunction(
  client: Client,
  orgId: string,
  fn: AiFunction,
  aiRoute: AiRoute,
  systemPrompt: string,
  userText: string,
  image: ModelImageInput,
  options: ModelCallOptions = aiRoute.limits,
  controlContext: AiControlContext = {},
) {
  await evaluateAiControls(client, orgId, controlContext);
  try {
    const result = await callModelWithImage(aiRoute.provider, aiRoute.model, aiRoute.apiKey, systemPrompt, userText, image, options);
    await markFunctionStatus(client, orgId, fn, "ok", "runtime", "Último uso validado.");
    return result;
  } catch (error) {
    const classified = classifyModelError(error);
    await recordFunctionError(client, orgId, fn, aiRoute, classified.status);
    await markFunctionStatus(client, orgId, fn, classified.status, "runtime", classified.detail);
    throw error;
  }
}
