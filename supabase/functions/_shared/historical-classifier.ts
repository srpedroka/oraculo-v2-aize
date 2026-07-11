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

function normalizeDocumentText(value: unknown, maxLength = 120_000) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, maxLength);
}

function splitTableCells(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return [];
  if (trimmed.includes("|")) {
    return trimmed
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell) => cell && !/^[-:]+$/.test(cell));
  }
  if (trimmed.includes("\t")) {
    return trimmed.split("\t").map((cell) => cell.trim()).filter(Boolean);
  }
  // Colunas separadas por 2+ espaços
  if (/\s{2,}/.test(trimmed)) {
    return trimmed.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
  }
  return [trimmed];
}

function yearInHeader(cell: string): number | null {
  const match = cell.match(/\b(20\d{2})\b/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isInteger(year) ? year : null;
}

function looksLikeMonthLabel(cell: string) {
  const token = normalizeTextForRouting(cell).replace(/[^a-z0-9]/g, "");
  if (!token) return false;
  if (MONTH_LABEL_BY_NORMALIZED[token]) return true;
  if (/^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/.test(token)) return true;
  const asNum = Number(token);
  return Number.isInteger(asNum) && asNum >= 1 && asNum <= 12;
}

/**
 * Tabelas "largas" (Mês | TOTAL 2025 | TOTAL 2026) viram linhas longas
 * "Janeiro 2025 | valor" para o histórico não misturar anos.
 */
export function expandMultiYearTables(rawText: string): { text: string; expanded: boolean; years: number[] } {
  const source = normalizeDocumentText(rawText);
  if (!source) return { text: "", expanded: false, years: [] };

  const lines = source.split("\n");
  const out: string[] = [];
  const yearsFound = new Set<number>();
  let expandedAny = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const headerCells = splitTableCells(line);
    const yearColumns = headerCells
      .map((cell, index) => ({ index, year: yearInHeader(cell) }))
      .filter((item): item is { index: number; year: number } => item.year != null);

    const uniqueYears = [...new Set(yearColumns.map((item) => item.year))];
    const hasMonthHint = headerCells.some((cell) => /mes|mês|month/i.test(cell) || looksLikeMonthLabel(cell));

    if (uniqueYears.length >= 2 && yearColumns.length >= 2 && (hasMonthHint || headerCells.length >= 3)) {
      for (const year of uniqueYears) yearsFound.add(year);
      out.push(`[Tabela expandida por ano — colunas: ${uniqueYears.join(", ")}]`);
      i += 1;
      while (i < lines.length) {
        const row = lines[i] ?? "";
        const rowTrim = row.trim();
        if (!rowTrim) {
          out.push("");
          i += 1;
          break;
        }
        // Nova tabela / seção
        const nextHeaderYears = splitTableCells(row)
          .map((cell) => yearInHeader(cell))
          .filter((year): year is number => year != null);
        if (nextHeaderYears.length >= 2 && splitTableCells(row).length >= 3 && !looksLikeMonthLabel(splitTableCells(row)[0] ?? "")) {
          break;
        }

        const cells = splitTableCells(row);
        if (cells.length < 2) {
          out.push(row);
          i += 1;
          continue;
        }

        // Rotulo = primeira celula que parece mes/nome; senao a primeira celula.
        let labelIndex = 0;
        for (let c = 0; c < cells.length; c += 1) {
          if (looksLikeMonthLabel(cells[c] ?? "")) {
            labelIndex = c;
            break;
          }
        }
        const label = cells[labelIndex] ?? cells[0] ?? "";
        const yearsInOrder = yearColumns.map((item) => item.year);
        const valueCells = cells.filter((_, index) => index !== labelIndex);
        let rowExpanded = false;

        // Caso tipico: "Janeiro | val2025 | val2026" com cabecalho "Mês | TOTAL 2025 | TOTAL 2026"
        if (valueCells.length === yearsInOrder.length) {
          for (let v = 0; v < yearsInOrder.length; v += 1) {
            const value = valueCells[v];
            const year = yearsInOrder[v];
            if (value == null || value === "" || yearInHeader(value)) continue;
            out.push(`${label} ${year} | ${value}`);
            yearsFound.add(year);
            rowExpanded = true;
            expandedAny = true;
          }
        } else {
          for (const { index, year } of yearColumns) {
            const value = cells[index];
            if (value == null || value === "" || yearInHeader(value)) continue;
            out.push(`${label} ${year} | ${value}`);
            yearsFound.add(year);
            rowExpanded = true;
            expandedAny = true;
          }
        }
        if (!rowExpanded) out.push(row);
        i += 1;
      }
      continue;
    }

    out.push(line);
    i += 1;
  }

  const text = out.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
  return {
    text: text || source,
    expanded: expandedAny,
    years: [...yearsFound].sort((a, b) => a - b),
  };
}

function periodFromYears(years: number[]): { period: string; periodFound: boolean } {
  if (!years.length) return { period: "", periodFound: false };
  if (years.length === 1) return { period: String(years[0]), periodFound: true };
  return { period: `${years[0]}–${years[years.length - 1]}`, periodFound: true };
}

function yearsMentionedInText(text: string) {
  const matches = String(text).match(/\b(20\d{2})\b/g) ?? [];
  return [...new Set(matches.map((item) => Number(item)).filter((year) => year >= 2000 && year <= 2100))].sort((a, b) => a - b);
}

const TABLE_NORMALIZATION_RULES = [
  "TABELAS COM VARIOS ANOS (critico para historico):",
  "- Se houver colunas como TOTAL 2025 | TOTAL 2026 (ou 2024/2025/...), NAO deixe so a linha larga.",
  "- Expanda para UMA LINHA POR MES+ANO, no formato: `Janeiro 2025 | R$ 1.234,56` e na linha seguinte `Janeiro 2026 | R$ 2.345,67`.",
  "- Repita o rotulo do mes em cada linha expandida. Nunca misture valores de anos diferentes na mesma linha sem o ano explicito.",
  "- Preserve todos os valores e rotulos; nao some colunas nem invente numeros.",
  "- No campo period dos metadados: se houver varios anos na tabela, use a faixa `2025–2026` (en-dash ou hifen) e periodFound=true.",
  "- Coloque o documento JA EXPANDIDO em normalizedText (texto) ou extractedText (imagem).",
].join("\n");

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
  const multiYear = periodFromYears(yearsMentionedInText(text));

  let period: { period: string; periodFound: boolean };
  if (modelExplicitlyMissedPeriod) {
    period = { period: "", periodFound: false };
  } else if (multiYear.periodFound && yearsMentionedInText(text).length >= 2) {
    // Prefer faixa multi-ano quando o texto expandido deixa isso claro.
    period = multiYear;
  } else if (parsedPeriodFound && parsedPeriod) {
    period = { period: parsedPeriod, periodFound: true };
  } else if (fallbackPeriod.periodFound) {
    period = fallbackPeriod;
  } else {
    period = multiYear;
  }

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
    "Voce prepara um documento historico para o Oraculo. Responda somente JSON valido.",
    'Formato: {"normalizedText":"texto canonico para gravar","documentType":"strategic|quarterly|monthly","area":"nome ou numero da area|null","period":"2024|2025–2026|T2 2024|Set 2024|","periodFound":true|false,"title":"titulo curto","summary":"1-2 linhas","confidence":0.0,"lowConfidenceFields":["period"]}',
    "Regras:",
    "- strategic: plano anual/estrategico da empresa.",
    "- quarterly: plano trimestral de area ou trimestre.",
    "- monthly: plano mensal, execucao mensal ou prioridades do mes.",
    "- Area: escolha somente uma das areas candidatas por nome ou numero; se nao houver sinal claro, retorne null.",
    "- Periodo: use 2024 para ano, T2 2024 para trimestre, Set 2024 para mes. Se a tabela tiver varios anos, use faixa 2025–2026.",
    "- Se nao houver data clara no texto, retorne period vazio e periodFound=false. Nunca invente ano.",
    "- O titulo deve ser descritivo, em PT-BR, com ate 120 caracteres.",
    "- normalizedText: versao do documento que sera salva no historico (ate ~12000 caracteres). Se nao precisar reescrever, repita o texto de entrada ja limpo.",
    TABLE_NORMALIZATION_RULES,
    "",
    "Areas candidatas:",
    areaList,
  ].join("\n");
}

function finalizeHistoricalText(rawCandidate: string, originalFallback: string) {
  const base = normalizeDocumentText(rawCandidate || originalFallback);
  const expanded = expandMultiYearTables(base);
  const years = expanded.years.length ? expanded.years : yearsMentionedInText(expanded.text);
  return {
    text: expanded.text,
    expanded: expanded.expanded,
    years,
  };
}

function suggestionWithMultiYearPeriod(suggestion: HistoricalMetadataSuggestion, years: number[]): HistoricalMetadataSuggestion {
  if (years.length < 2) return suggestion;
  const range = periodFromYears(years);
  return {
    ...suggestion,
    period: range.period,
    periodFound: true,
    lowConfidenceFields: suggestion.lowConfidenceFields.filter((field) => field !== "period"),
  };
}

export async function suggestHistoricalMetadata(
  client: Client,
  params: { orgId: string; rawText: string; fileName?: string | null; areas: AreaCandidate[] },
): Promise<{ suggestion: HistoricalMetadataSuggestion; extractedText: string; tableExpanded: boolean }> {
  const preExpanded = expandMultiYearTables(params.rawText);
  const text = truncateForModel(preExpanded.text);
  const aiRoute = await resolveAiFunction(client, params.orgId, "background");
  if (!aiRoute) {
    const finalized = finalizeHistoricalText(preExpanded.text, params.rawText);
    return {
      extractedText: finalized.text,
      tableExpanded: finalized.expanded || preExpanded.expanded,
      suggestion: suggestionWithMultiYearPeriod(
        fallbackSuggestion(finalized.text, params.areas, "heuristic"),
        finalized.years,
      ),
    };
  }

  try {
    const result = await callModelForFunction(
      client,
      params.orgId,
      "background",
      aiRoute,
      systemPrompt(params.areas),
      [{ role: "user", content: [`Arquivo: ${params.fileName ?? "Texto colado"}`, "", text].join("\n") }],
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
      metadata: { aiFunction: "background", action: "historical_metadata_suggestion", fileName: params.fileName ?? null },
    });

    const parsed = parseJsonObject(result.text);
    const candidateText = String(parsed?.normalizedText ?? parsed?.normalized_text ?? parsed?.extractedText ?? parsed?.extracted_text ?? "").trim()
      || preExpanded.text
      || params.rawText;
    const finalized = finalizeHistoricalText(candidateText, params.rawText);

    if (!parsed) {
      return {
        extractedText: finalized.text,
        tableExpanded: finalized.expanded || preExpanded.expanded,
        suggestion: suggestionWithMultiYearPeriod(
          fallbackSuggestion(finalized.text, params.areas, "heuristic"),
          finalized.years,
        ),
      };
    }

    return {
      extractedText: finalized.text,
      tableExpanded: finalized.expanded || preExpanded.expanded,
      suggestion: suggestionWithMultiYearPeriod(
        sanitizeAiSuggestion(parsed, finalized.text, params.areas),
        finalized.years,
      ),
    };
  } catch (error) {
    console.error("Erro ao sugerir metadados historicos", error instanceof Error ? error.message : String(error));
    const finalized = finalizeHistoricalText(preExpanded.text, params.rawText);
    return {
      extractedText: finalized.text,
      tableExpanded: finalized.expanded || preExpanded.expanded,
      suggestion: suggestionWithMultiYearPeriod(
        fallbackSuggestion(finalized.text, params.areas, "heuristic"),
        finalized.years,
      ),
    };
  }
}

function imageSystemPrompt(areas: AreaCandidate[]) {
  return [
    systemPrompt(areas),
    "",
    "A entrada e uma IMAGEM (foto ou captura de tela) de um documento historico.",
    "1) Transcreva o texto legivel da imagem em portugues, sem inventar trechos ilegíveis (use [ilegivel] se precisar).",
    "2) Se houver tabela com colunas de anos diferentes, JA DEIXE o extractedText no formato expandido mes+ano (veja regras de tabelas).",
    "3) Preencha os metadados com base no texto expandido.",
    'Inclua no JSON o campo "extractedText" com a transcricao/normalizacao completa (ate ~12000 caracteres).',
    'Formato: {"extractedText":"...","normalizedText":"...opcional...","documentType":"strategic|quarterly|monthly","area":"...","period":"...","periodFound":true|false,"title":"...","summary":"...","confidence":0.0,"lowConfidenceFields":[]}',
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
): Promise<{ suggestion: HistoricalMetadataSuggestion; extractedText: string; tableExpanded: boolean }> {
  const aiRoute = await resolveAiFunction(client, params.orgId, "background");
  if (!aiRoute) {
    throw new Error("Configure a função de IA de bastidores (background) com um provedor que leia imagem (OpenAI, Anthropic ou xAI).");
  }

  const userText = [
    `Arquivo: ${params.fileName ?? "Imagem histórica"}`,
    "Transcreva o documento da imagem, expanda tabelas multi-ano (uma linha por mês+ano) e devolva o JSON pedido no system prompt.",
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
      { ...aiRoute.limits, maxTokens: Math.max(aiRoute.limits.maxTokens ?? 2000, 4000) },
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
    const rawExtracted = String(
      parsed?.normalizedText ?? parsed?.normalized_text ?? parsed?.extractedText ?? parsed?.extracted_text ?? "",
    ).trim() || String(result.text ?? "").trim();
    const finalized = finalizeHistoricalText(rawExtracted, rawExtracted);

    if (!finalized.text) {
      throw new Error("Não consegui ler texto nesta imagem. Envie uma foto mais nítida ou um PDF/DOCX com texto.");
    }

    if (!parsed) {
      return {
        extractedText: finalized.text,
        tableExpanded: finalized.expanded,
        suggestion: suggestionWithMultiYearPeriod(
          fallbackSuggestion(finalized.text, params.areas, "heuristic"),
          finalized.years,
        ),
      };
    }

    return {
      extractedText: finalized.text,
      tableExpanded: finalized.expanded,
      suggestion: suggestionWithMultiYearPeriod(
        sanitizeAiSuggestion(parsed, finalized.text, params.areas),
        finalized.years,
      ),
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
