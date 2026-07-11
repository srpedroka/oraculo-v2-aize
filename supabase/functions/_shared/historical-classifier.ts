import { resolveAiFunction } from "./ai-router.ts";
import { callModelForFunction, callModelWithImageForFunction } from "./call-for-function.ts";
import { parseJsonObject } from "./json.ts";
import type { ModelImageInput } from "./model.ts";
import { inferPlanningType, normalizeTextForRouting } from "./periods.ts";
import { recordAiUsage } from "./usage.ts";

type Client = any;
type DocumentType = "strategic" | "quarterly" | "monthly";
type SuggestionSource = "ai_background" | "heuristic";

interface AreaCandidate {
  id: string;
  name: string;
}

export interface HistoricalMetadataSuggestion {
  documentType: DocumentType;
  areaId: string | null;
  areaName: string | null;
  period: string;
  periodFound: boolean;
  title: string;
  summary: string;
  confidence: number;
  lowConfidenceFields: string[];
  source: SuggestionSource;
}

const VALID_DOCUMENT_TYPES = new Set<DocumentType>(["strategic", "quarterly", "monthly"]);
const MONTH_LABEL_BY_NORMALIZED: Record<string, string> = {
  jan: "Jan",
  janeiro: "Jan",
  fev: "Fev",
  fevereiro: "Fev",
  mar: "Mar",
  marco: "Mar",
  abr: "Abr",
  abril: "Abr",
  mai: "Mai",
  maio: "Mai",
  jun: "Jun",
  junho: "Jun",
  jul: "Jul",
  julho: "Jul",
  ago: "Ago",
  agosto: "Ago",
  set: "Set",
  setembro: "Set",
  out: "Out",
  outubro: "Out",
  nov: "Nov",
  novembro: "Nov",
  dez: "Dez",
  dezembro: "Dez",
};

function clampConfidence(value: unknown, fallback = 0.5) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function asText(value: unknown, maxLength = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function truncateForModel(rawText: string) {
  const normalized = rawText.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").trim();
  if (normalized.length <= 8000) return normalized;
  return `${normalized.slice(0, 6000)}\n\n[...trecho intermediario omitido...]\n\n${normalized.slice(-2000)}`;
}

function normalizeAreaToken(value: unknown) {
  return normalizeTextForRouting(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function resolveArea(value: unknown, areas: AreaCandidate[]) {
  const token = normalizeAreaToken(value);
  if (!token) return null;

  const numericIndex = Number(token);
  if (Number.isInteger(numericIndex) && numericIndex >= 1 && numericIndex <= areas.length) {
    return areas[numericIndex - 1];
  }

  return (
    areas.find((area) => normalizeAreaToken(area.name) === token) ??
    areas.find((area) => token.includes(normalizeAreaToken(area.name)) || normalizeAreaToken(area.name).includes(token)) ??
    null
  );
}

function inferAreaFromText(text: string, areas: AreaCandidate[]) {
  const normalized = normalizeAreaToken(text);
  return areas.find((area) => normalized.includes(normalizeAreaToken(area.name))) ?? null;
}

function normalizeDocumentType(value: unknown, text: string): DocumentType {
  if (VALID_DOCUMENT_TYPES.has(value as DocumentType)) return value as DocumentType;
  return inferPlanningType(text) ?? "strategic";
}

function extractPeriod(text: string, preferredType: DocumentType): { period: string; periodFound: boolean } {
  const normalized = normalizeTextForRouting(text);
  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  const year = yearMatch?.[1] ?? "";

  const quarterMatch = normalized.match(/\b(?:t|q)([1-4])\b|\b([1-4])(?:o|º)?\s*tri(?:mestre|mestral)?\b/);
  if ((preferredType === "quarterly" || quarterMatch) && quarterMatch && year) {
    return { period: `T${quarterMatch[1] ?? quarterMatch[2]} ${year}`, periodFound: true };
  }

  const monthEntry = Object.entries(MONTH_LABEL_BY_NORMALIZED).find(([month]) => new RegExp(`\\b${month}\\b`).test(normalized));
  if ((preferredType === "monthly" || monthEntry) && monthEntry && year) {
    return { period: `${monthEntry[1]} ${year}`, periodFound: true };
  }

  if (year) return { period: year, periodFound: true };
  return { period: "", periodFound: false };
}

function buildTitle(params: { documentType: DocumentType; areaName: string | null; period: string; text: string }) {
  const labels: Record<DocumentType, string> = {
    strategic: "Plano estratégico",
    quarterly: "Plano trimestral",
    monthly: "Plano mensal",
  };
  const area = params.areaName ? ` de ${params.areaName}` : "";
  const period = params.period ? ` (${params.period})` : "";
  return `${labels[params.documentType]}${area}${period}`;
}

function fallbackSuggestion(text: string, areas: AreaCandidate[], source: SuggestionSource): HistoricalMetadataSuggestion {
  const documentType = inferPlanningType(text) ?? "strategic";
  const area = inferAreaFromText(text, areas);
  const period = extractPeriod(text, documentType);
  const lowConfidenceFields = [
    ...(period.periodFound ? [] : ["period"]),
    ...(area ? [] : ["area"]),
  ];
  const title = buildTitle({ documentType, areaName: area?.name ?? null, period: period.period, text });

  return {
    documentType,
    areaId: area?.id ?? null,
    areaName: area?.name ?? null,
    period: period.period,
    periodFound: period.periodFound,
    title,
    summary: "Sugestao montada por leitura heuristica do texto.",
    confidence: area || period.periodFound ? 0.55 : 0.42,
    lowConfidenceFields,
    source,
  };
}

function sanitizeAiSuggestion(parsed: any, text: string, areas: AreaCandidate[]): HistoricalMetadataSuggestion {
  const documentType = normalizeDocumentType(parsed?.documentType ?? parsed?.document_type, text);
  const area = resolveArea(parsed?.area ?? parsed?.areaName ?? parsed?.area_name ?? parsed?.areaIndex ?? parsed?.area_index, areas);
  const periodFoundValue = parsed?.periodFound ?? parsed?.period_found;
  const modelExplicitlyMissedPeriod = periodFoundValue === false;
  const parsedPeriodFound = Boolean(periodFoundValue);
  const parsedPeriod = asText(parsed?.period, 80);
  const fallbackPeriod = extractPeriod(text, documentType);
  const period = modelExplicitlyMissedPeriod
    ? { period: "", periodFound: false }
    : parsedPeriodFound && parsedPeriod
      ? { period: parsedPeriod, periodFound: true }
      : fallbackPeriod.periodFound
        ? fallbackPeriod
        : { period: "", periodFound: false };
  const lowConfidence = Array.isArray(parsed?.lowConfidenceFields)
    ? parsed.lowConfidenceFields.map((item: unknown) => asText(item, 40)).filter(Boolean)
    : [];
  if (!period.periodFound && !lowConfidence.includes("period")) lowConfidence.push("period");
  if (!area && !lowConfidence.includes("area")) lowConfidence.push("area");

  const title = asText(parsed?.title, 120) || buildTitle({ documentType, areaName: area?.name ?? null, period: period.period, text });
  return {
    documentType,
    areaId: area?.id ?? null,
    areaName: area?.name ?? null,
    period: period.periodFound ? period.period : "",
    periodFound: period.periodFound,
    title,
    summary: asText(parsed?.summary, 320),
    confidence: clampConfidence(parsed?.confidence, 0.6),
    lowConfidenceFields: [...new Set(lowConfidence)],
    source: "ai_background",
  };
}

function systemPrompt(areas: AreaCandidate[]) {
  const areaList = areas.length
    ? areas.map((area, index) => `${index + 1}. ${area.name}`).join("\n")
    : "Nenhuma area candidata. Use escopo Empresa.";

  return [
    "Voce sugere metadados para importar um documento historico no Oraculo. Responda somente JSON valido.",
    'Formato: {"documentType":"strategic|quarterly|monthly","area":"nome ou numero da area|null","period":"2024|T2 2024|Set 2024|","periodFound":true|false,"title":"titulo curto","summary":"1-2 linhas","confidence":0.0,"lowConfidenceFields":["period"]}',
    "Regras:",
    "- strategic: plano anual/estrategico da empresa.",
    "- quarterly: plano trimestral de area ou trimestre.",
    "- monthly: plano mensal, execucao mensal ou prioridades do mes.",
    "- Area: escolha somente uma das areas candidatas por nome ou numero; se nao houver sinal claro, retorne null.",
    "- Periodo: use 2024 para ano, T2 2024 para trimestre, Set 2024 para mes.",
    "- Se nao houver data clara no texto, retorne period vazio e periodFound=false. Nunca invente ano.",
    "- O titulo deve ser descritivo, em PT-BR, com ate 120 caracteres.",
    "",
    "Areas candidatas:",
    areaList,
  ].join("\n");
}

export async function suggestHistoricalMetadata(
  client: Client,
  params: { orgId: string; rawText: string; fileName?: string | null; areas: AreaCandidate[] },
): Promise<HistoricalMetadataSuggestion> {
  const text = truncateForModel(params.rawText);
  const aiRoute = await resolveAiFunction(client, params.orgId, "background");
  if (!aiRoute) return fallbackSuggestion(text, params.areas, "heuristic");

  try {
    const result = await callModelForFunction(
      client,
      params.orgId,
      "background",
      aiRoute,
      systemPrompt(params.areas),
      [{ role: "user", content: [`Arquivo: ${params.fileName ?? "Texto colado"}`, "", text].join("\n") }],
      aiRoute.limits,
    );

    await recordAiUsage({
      client,
      orgId: params.orgId,
      provider: aiRoute.provider,
      model: aiRoute.model,
      channel: "web",
      usage: result.usage,
      settings: aiRoute.legacySettings,
      metadata: { aiFunction: "background", action: "historical_metadata_suggestion", fileName: params.fileName ?? null },
    });

    const parsed = parseJsonObject(result.text);
    if (!parsed) return fallbackSuggestion(text, params.areas, "heuristic");
    return sanitizeAiSuggestion(parsed, text, params.areas);
  } catch (error) {
    console.error("Erro ao sugerir metadados historicos", error instanceof Error ? error.message : String(error));
    return fallbackSuggestion(text, params.areas, "heuristic");
  }
}

function imageSystemPrompt(areas: AreaCandidate[]) {
  return [
    systemPrompt(areas),
    "",
    "A entrada e uma IMAGEM (foto ou captura de tela) de um documento historico.",
    "1) Transcreva o texto legivel da imagem em portugues, sem inventar trechos ilegíveis (use [ilegivel] se precisar).",
    "2) Com base no texto lido, preencha os metadados.",
    'Inclua no JSON o campo "extractedText" com a transcricao completa (ate ~12000 caracteres).',
    'Formato: {"extractedText":"...","documentType":"strategic|quarterly|monthly","area":"...","period":"...","periodFound":true|false,"title":"...","summary":"...","confidence":0.0,"lowConfidenceFields":[]}',
  ].join("\n");
}

export async function suggestHistoricalMetadataFromImage(
  client: Client,
  params: {
    orgId: string;
    image: ModelImageInput;
    fileName?: string | null;
    areas: AreaCandidate[];
  },
): Promise<{ suggestion: HistoricalMetadataSuggestion; extractedText: string }> {
  const aiRoute = await resolveAiFunction(client, params.orgId, "background");
  if (!aiRoute) {
    throw new Error("Configure a função de IA de bastidores (background) com um provedor que leia imagem (OpenAI, Anthropic ou xAI).");
  }

  const userText = [
    `Arquivo: ${params.fileName ?? "Imagem histórica"}`,
    "Transcreva o documento da imagem e devolva o JSON pedido no system prompt.",
  ].join("\n");

  try {
    const result = await callModelWithImageForFunction(
      client,
      params.orgId,
      "background",
      aiRoute,
      imageSystemPrompt(params.areas),
      userText,
      params.image,
      { ...aiRoute.limits, maxTokens: Math.max(aiRoute.limits.maxTokens ?? 2000, 3500) },
    );

    await recordAiUsage({
      client,
      orgId: params.orgId,
      provider: aiRoute.provider,
      model: aiRoute.model,
      channel: "web",
      usage: result.usage,
      settings: aiRoute.legacySettings,
      metadata: {
        aiFunction: "background",
        action: "historical_image_import",
        fileName: params.fileName ?? null,
      },
    });

    const parsed = parseJsonObject(result.text);
    const rawExtracted = String(parsed?.extractedText ?? parsed?.extracted_text ?? "").trim() || String(result.text ?? "").trim();
    const normalizedExtracted = rawExtracted
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim()
      .slice(0, 120_000);

    if (!normalizedExtracted) {
      throw new Error("Não consegui ler texto nesta imagem. Envie uma foto mais nítida ou um PDF/DOCX com texto.");
    }

    if (!parsed) {
      return {
        extractedText: normalizedExtracted,
        suggestion: fallbackSuggestion(normalizedExtracted, params.areas, "heuristic"),
      };
    }

    return {
      extractedText: normalizedExtracted,
      suggestion: sanitizeAiSuggestion(parsed, normalizedExtracted, params.areas),
    };
  } catch (error) {
    if (error instanceof Error && /imagem|image|vision|não aceita|indispon/i.test(error.message)) {
      throw error;
    }
    console.error("Erro ao importar historico por imagem", error instanceof Error ? error.message : String(error));
    throw new Error(
      error instanceof Error
        ? error.message
        : "Não foi possível ler a imagem do histórico. Use JPG, PNG ou WEBP, ou importe PDF/DOCX.",
    );
  }
}
