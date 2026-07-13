import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertOwner, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callModelWithWebSearch, type Provider } from "../_shared/model.ts";
import { recordAiUsage } from "../_shared/usage.ts";
import { evaluateAiControls } from "../_shared/ai-controls.ts";

const MAX_LINKS = 5;
const DEFAULT_MODEL_BY_PROVIDER: Record<"openai" | "anthropic", string> = {
  openai: "gpt-5.4",
  anthropic: "claude-sonnet-4-6",
};

function asText(value: unknown, maxLength = 10_000) {
  return String(value ?? "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").trim().slice(0, maxLength);
}

/** Aceita https://..., http://... ou domínio solto (www.gaam.com.br → https://www.gaam.com.br). */
function normalizeLinkUrl(raw: string): string {
  const value = asText(raw, 2000);
  if (!value) return "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return value;
  return `https://${value.replace(/^\/+/, "")}`;
}

function validateLinks(raw: unknown): string[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error("links deve ser uma lista de URLs");
  if (raw.length > MAX_LINKS) throw new Error(`No máximo ${MAX_LINKS} links`);

  const links: string[] = [];
  for (const item of raw) {
    const original = asText(item, 2000);
    if (!original) continue;
    const value = normalizeLinkUrl(original);

    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`Link inválido: ${original}. Use o endereço completo, ex.: https://www.gaam.com.br`);
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Link inválido (use http ou https): ${original}`);
    }

    if (!parsed.hostname || !parsed.hostname.includes(".")) {
      throw new Error(`Link inválido: ${original}. Use o endereço completo, ex.: https://www.gaam.com.br`);
    }

    links.push(parsed.toString());
  }

  if (links.length > MAX_LINKS) throw new Error(`No máximo ${MAX_LINKS} links`);
  return links;
}

function buildSearchTerms(organization: { name?: string | null; subtitle?: string | null }) {
  return [organization.name, organization.subtitle]
    .flatMap((value) => String(value ?? "").split("/"))
    .map((term) => term.trim())
    .filter(Boolean);
}

async function resolveWebSearchRoute(client: ReturnType<typeof serviceClient>, orgId: string) {
  const { data: keyRows, error: keyError } = await client
    .from("ai_model_keys")
    .select("provider, api_key")
    .eq("org_id", orgId)
    .in("provider", ["anthropic", "openai"]);
  if (keyError) throw keyError;

  const keyByProvider = new Map<string, string>();
  for (const row of keyRows ?? []) {
    const provider = String(row.provider ?? "").trim();
    const apiKey = String(row.api_key ?? "").trim();
    if (provider && apiKey) keyByProvider.set(provider, apiKey);
  }

  let provider: "anthropic" | "openai" | null = null;
  if (keyByProvider.has("anthropic")) provider = "anthropic";
  else if (keyByProvider.has("openai")) provider = "openai";

  if (!provider) {
    throw new Error("O perfil precisa de uma chave Anthropic ou OpenAI cadastrada na aba IA");
  }

  const { data: functionRows, error: functionError } = await client
    .from("ai_function_settings")
    .select("function, provider, model")
    .eq("org_id", orgId)
    .eq("provider", provider);
  if (functionError) throw functionError;

  const modelByFunction = new Map<string, string>();
  for (const row of functionRows ?? []) {
    const fn = String(row.function ?? "").trim();
    const model = String(row.model ?? "").trim();
    if (fn && model) modelByFunction.set(fn, model);
  }

  const model =
    modelByFunction.get("background") ||
    modelByFunction.get("daily") ||
    modelByFunction.get("planning") ||
    DEFAULT_MODEL_BY_PROVIDER[provider];

  const { data: legacySettings } = await client.from("ai_settings").select("*").eq("org_id", orgId).maybeSingle();

  return {
    provider: provider as Provider,
    model,
    apiKey: keyByProvider.get(provider) as string,
    legacySettings,
  };
}

function buildResearchPrompt(params: { queries: string[]; links: string[] }) {
  const linksBlock = params.links.length
    ? params.links.map((link) => `- ${link}`).join("\n")
    : "- (nenhum link informado pelo dono)";

  return [
    "Pesquise na internet a empresa pelos termos e links abaixo.",
    "Priorize sites e canais oficiais da empresa.",
    "Sintetize um resumo descritivo em português do Brasil com cerca de 150 palavras:",
    "o que a empresa faz, setor, produtos/serviços e canais/presença digital.",
    "NÃO invente fatos. Se a busca não encontrar informações confiáveis, diga isso honestamente no resumo.",
    "",
    `Termos de busca: ${params.queries.join(" | ") || "(nenhum)"}`,
    "Links informados pelo dono:",
    linksBlock,
  ].join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const user = await getUser(req);
    const payload = await req.json();
    const orgId = asText(payload.orgId, 80);
    if (!orgId) throw new Error("Empresa ausente");

    const links = validateLinks(payload.links);
    await assertOwner(user.id, orgId);

    const client = serviceClient();
    const { data: organization, error: orgError } = await client
      .from("organizations")
      .select("id, name, subtitle")
      .eq("id", orgId)
      .maybeSingle();
    if (orgError) throw orgError;
    if (!organization) throw new Error("Empresa não encontrada");

    const queries = buildSearchTerms(organization);
    if (!queries.length) throw new Error("A empresa precisa de um nome para pesquisar o perfil");

    const route = await resolveWebSearchRoute(client, orgId);
    const prompt = buildResearchPrompt({ queries, links });
    await evaluateAiControls(client, orgId, { userId: user.id });
    const result = await callModelWithWebSearch(route.provider, route.model, route.apiKey, prompt, {
      maxTokens: 1200,
      temperature: 0.2,
    });

    await recordAiUsage({
      client,
      orgId,
      provider: route.provider,
      model: route.model,
      channel: "web",
      usage: result.usage,
      settings: route.legacySettings,
      metadata: {
        aiFunction: "background",
        action: "company_research",
        queries,
        linkCount: links.length,
        sourceCount: result.sources.length,
      },
    });

    return jsonResponse({
      suggestion: {
        summary: result.text,
        sources: result.sources.map((source) => ({ url: source.url, title: source.title })),
        queries,
        links,
      },
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Não foi possível pesquisar o perfil da empresa" }, 400);
  }
});
