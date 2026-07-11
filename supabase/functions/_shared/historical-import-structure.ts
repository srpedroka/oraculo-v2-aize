/**
 * Segmentação determinística, fingerprints e conflitos da importação histórica (Fatia 4).
 * Não chama IA — só organiza texto/tabelas e monta o contrato estruturado.
 */

export type DocumentType = "strategic" | "quarterly" | "monthly";

export interface AreaCandidate {
  id: string;
  name: string;
}

export interface HistoricalTableCandidate {
  id: string;
  label: string;
  headers: string[];
  normalizedText: string;
  years: number[];
  rowCount: number;
  fingerprint: string;
}

export interface HistoricalDocumentCandidate {
  id: string;
  title: string;
  documentType: DocumentType;
  areaId: string | null;
  areaName: string | null;
  period: string;
  periodFound: boolean;
  summary: string;
  normalizedText: string;
  tableIds: string[];
  confidence: {
    title: number;
    documentType: number;
    area: number;
    period: number;
  };
  lowConfidenceFields: string[];
}

export interface HistoricalConflict {
  id: string;
  kind: "table_choice" | "period" | "area" | "duplicate" | "value";
  message: string;
  candidateIds: string[];
  tableIds: string[];
  required: boolean;
}

export interface HistoricalImportSuggestion {
  sourceName: string | null;
  extractedText: string;
  candidates: HistoricalDocumentCandidate[];
  tables: HistoricalTableCandidate[];
  conflicts: HistoricalConflict[];
  warnings: string[];
}

const MAX_TABLES = 20;
const MAX_CANDIDATES = 12;
const MAX_EXTRACTED = 200_000;
const MAX_CANDIDATE_TEXT_TOTAL = 120_000;

function asText(value: unknown, max = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeDocumentText(value: unknown, maxLength = MAX_EXTRACTED) {
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
  if (!trimmed) return [] as string[];
  if (trimmed.includes("|")) {
    return trimmed
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell) => cell && !/^[-:]+$/.test(cell));
  }
  if (trimmed.includes("\t")) {
    return trimmed.split("\t").map((cell) => cell.trim()).filter(Boolean);
  }
  if (/\s{2,}/.test(trimmed)) {
    return trimmed.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
  }
  return [trimmed];
}

function yearInCell(cell: string): number | null {
  const match = cell.match(/\b(20\d{2})\b/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isInteger(year) ? year : null;
}

function yearsInText(text: string) {
  const matches = String(text).match(/\b(20\d{2})\b/g) ?? [];
  return [...new Set(matches.map((item) => Number(item)).filter((year) => year >= 2000 && year <= 2100))].sort(
    (a, b) => a - b,
  );
}

/** Hash estável simples (não criptográfico) para fingerprint de tabela. */
export function stableFingerprint(parts: string[]) {
  const input = parts.join("\n").toLowerCase().replace(/\s+/g, " ").trim();
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `t${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function isTabularLine(line: string) {
  const cells = splitTableCells(line);
  if (cells.length < 2) return false;
  return /\||\t|\s{2,}/.test(line) || cells.some((cell) => yearInCell(cell) != null);
}

/**
 * Extrai blocos de tabela do texto (sem escolher qual usar).
 * Tabelas multi-ano já expandidas também viram candidatos.
 */
export function extractTableCandidates(rawText: string): HistoricalTableCandidate[] {
  const text = normalizeDocumentText(rawText);
  if (!text) return [];

  const lines = text.split("\n");
  const tables: HistoricalTableCandidate[] = [];
  let i = 0;
  let tableIndex = 0;

  while (i < lines.length && tables.length < MAX_TABLES) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (!trimmed) {
      i += 1;
      continue;
    }

    const isMarker = /^\[Tabela expandida por ano/i.test(trimmed);
    const cells = splitTableCells(trimmed);
    const yearCols = cells.map((cell) => yearInCell(cell)).filter((year): year is number => year != null);
    const startsTable = isMarker || (isTabularLine(trimmed) && (yearCols.length >= 1 || cells.length >= 3));

    if (!startsTable) {
      i += 1;
      continue;
    }

    const block: string[] = [trimmed];
    const headers = isMarker ? ["rótulo", "valor"] : cells;
    i += 1;
    while (i < lines.length) {
      const row = (lines[i] ?? "").trim();
      if (!row) {
        i += 1;
        break;
      }
      if (/^\[Tabela expandida por ano/i.test(row) && block.length > 1) break;
      // Novo cabeçalho multi-ano
      const nextYears = splitTableCells(row).map((cell) => yearInCell(cell)).filter((year): year is number => year != null);
      if (nextYears.length >= 2 && splitTableCells(row).length >= 3 && block.length > 2) break;
      if (!isTabularLine(row) && !/20\d{2}\s*\|/.test(row) && block.length > 3) break;
      block.push(row);
      i += 1;
      if (block.length > 80) break;
    }

    const normalizedText = block.join("\n").slice(0, 20_000);
    const years = yearsInText(normalizedText);
    const dataRows = block.filter((row) => row && !/^\[Tabela/.test(row));
    const fingerprint = stableFingerprint([
      headers.join("|"),
      years.join(","),
      ...dataRows.slice(0, 12).map((row) => row.replace(/\s+/g, " ")),
    ]);
    tableIndex += 1;
    tables.push({
      id: `table_${tableIndex}`,
      label: years.length
        ? `Tabela ${tableIndex} (${years.join("–")})`
        : `Tabela ${tableIndex}`,
      headers: headers.slice(0, 12),
      normalizedText,
      years,
      rowCount: Math.max(0, dataRows.length - (isMarker ? 0 : 1)),
      fingerprint,
    });
  }

  return tables;
}

function shortTitleFromSource(fileName: string | null | undefined, text: string) {
  const fromFile = asText(fileName, 80).replace(/\.[a-z0-9]{1,5}$/i, "");
  if (fromFile && fromFile.length >= 3 && !/^texto colado$/i.test(fromFile)) {
    return fromFile.slice(0, 100);
  }
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("[") && line.length >= 3 && line.length <= 100);
  if (firstLine) return firstLine.slice(0, 100);
  return "Documento histórico";
}

export function legacySuggestionToCandidate(
  suggestion: {
    documentType: DocumentType;
    areaId: string | null;
    areaName: string | null;
    period: string;
    periodFound: boolean;
    title: string;
    summary: string;
    confidence: number;
    lowConfidenceFields: string[];
  },
  params: { normalizedText: string; tableIds: string[]; id?: string },
): HistoricalDocumentCandidate {
  const conf = clamp(suggestion.confidence, 0.5);
  const low = new Set(suggestion.lowConfidenceFields);
  return {
    id: params.id ?? "doc_1",
    title: asText(suggestion.title, 100) || "Documento histórico",
    documentType: suggestion.documentType,
    areaId: suggestion.areaId,
    areaName: suggestion.areaName,
    period: suggestion.periodFound ? suggestion.period : "",
    periodFound: suggestion.periodFound,
    summary: asText(suggestion.summary, 320),
    normalizedText: normalizeDocumentText(params.normalizedText, 40_000),
    tableIds: params.tableIds,
    confidence: {
      title: low.has("title") ? Math.min(conf, 0.45) : conf,
      documentType: low.has("documentType") ? Math.min(conf, 0.45) : conf,
      area: low.has("area") || low.has("areaId") ? Math.min(conf, 0.45) : conf,
      period: low.has("period") || !suggestion.periodFound ? Math.min(conf, 0.4) : conf,
    },
    lowConfidenceFields: [...low],
  };
}

function clamp(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

/**
 * Detecta conflitos obrigatórios entre tabelas/candidatos (sem escolher silenciosamente).
 */
export function detectHistoricalConflicts(params: {
  candidates: HistoricalDocumentCandidate[];
  tables: HistoricalTableCandidate[];
  tableExpanded: boolean;
}): HistoricalConflict[] {
  const conflicts: HistoricalConflict[] = [];
  const { candidates, tables } = params;
  let n = 0;
  const nextId = (kind: string) => {
    n += 1;
    return `conflict_${kind}_${n}`;
  };

  // Tabelas com mesmo fingerprint → duplicate
  const byFp = new Map<string, HistoricalTableCandidate[]>();
  for (const table of tables) {
    const list = byFp.get(table.fingerprint) ?? [];
    list.push(table);
    byFp.set(table.fingerprint, list);
  }
  for (const group of byFp.values()) {
    if (group.length < 2) continue;
    conflicts.push({
      id: nextId("duplicate"),
      kind: "duplicate",
      message: "Encontrei tabelas idênticas ou quase idênticas. Confirme se deve manter só uma.",
      candidateIds: candidates.map((item) => item.id),
      tableIds: group.map((item) => item.id),
      required: false,
    });
  }

  // Tabelas com anos sobrepostos e valores diferentes → table_choice obrigatório
  for (let i = 0; i < tables.length; i += 1) {
    for (let j = i + 1; j < tables.length; j += 1) {
      const left = tables[i];
      const right = tables[j];
      if (left.fingerprint === right.fingerprint) continue;
      const sharedYears = left.years.filter((year) => right.years.includes(year));
      if (!sharedYears.length) continue;
      // Mesmo conjunto de anos e tamanho similar, mas texto diferente → conflito de valor
      const sameYearSet =
        left.years.length === right.years.length && left.years.every((year, index) => year === right.years[index]);
      if (sameYearSet || sharedYears.length >= 1) {
        const leftPreview = left.normalizedText.slice(0, 400);
        const rightPreview = right.normalizedText.slice(0, 400);
        if (leftPreview !== rightPreview) {
          conflicts.push({
            id: nextId("table"),
            kind: "table_choice",
            message: `Há duas tabelas com informações do(s) ano(s) ${sharedYears.join(", ")} e valores diferentes. Escolha qual usar.`,
            candidateIds: candidates.map((item) => item.id),
            tableIds: [left.id, right.id],
            required: true,
          });
        }
      }
    }
  }

  // Período do título/candidato vs anos da tabela
  for (const candidate of candidates) {
    if (!candidate.periodFound || !candidate.period) continue;
    const periodYears = yearsInText(candidate.period);
    if (!periodYears.length) continue;
    const linkedTables = tables.filter((table) => candidate.tableIds.includes(table.id));
    for (const table of linkedTables) {
      if (!table.years.length) continue;
      const mismatch = periodYears.some((year) => !table.years.includes(year)) &&
        table.years.some((year) => !periodYears.includes(year));
      if (mismatch) {
        conflicts.push({
          id: nextId("period"),
          kind: "period",
          message: `O período sugerido (${candidate.period}) não bate com os anos da tabela (${table.years.join("–")}). Confirme o período.`,
          candidateIds: [candidate.id],
          tableIds: [table.id],
          required: true,
        });
      }
    }
  }

  // Multi-ano expandido sem evidência clara de linhas mensais vs totais
  if (params.tableExpanded) {
    const multi = tables.filter((table) => table.years.length >= 2);
    for (const table of multi) {
      const hasMonth = /(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|janeiro|fevereiro)/i.test(table.normalizedText);
      const hasTotalOnly = /total|acumulado|ano\b/i.test(table.normalizedText) && !hasMonth;
      if (hasTotalOnly) {
        conflicts.push({
          id: nextId("value"),
          kind: "value",
          message: "Esta tabela multi-ano pode ser total anual ou série mensal. Confirme a leitura antes de salvar.",
          candidateIds: candidates.map((item) => item.id),
          tableIds: [table.id],
          required: true,
        });
      }
    }
  }

  // Dedup por message+tableIds
  const seen = new Set<string>();
  return conflicts.filter((conflict) => {
    const key = `${conflict.kind}:${conflict.tableIds.join(",")}:${conflict.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 30);
}

export function buildHistoricalImportSuggestion(params: {
  sourceName: string | null;
  extractedText: string;
  suggestion: {
    documentType: DocumentType;
    areaId: string | null;
    areaName: string | null;
    period: string;
    periodFound: boolean;
    title: string;
    summary: string;
    confidence: number;
    lowConfidenceFields: string[];
  };
  tableExpanded: boolean;
  warnings?: string[];
}): HistoricalImportSuggestion {
  let extractedText = normalizeDocumentText(params.extractedText, MAX_EXTRACTED);
  if (!extractedText) {
    extractedText = shortTitleFromSource(params.sourceName, "");
  }

  const tables = extractTableCandidates(extractedText).slice(0, MAX_TABLES);
  const tableIds = tables.map((table) => table.id);
  let candidate = legacySuggestionToCandidate(params.suggestion, {
    normalizedText: extractedText,
    tableIds,
    id: "doc_1",
  });

  // Título nunca pode ser o dump inteiro / JSON
  if (
    !candidate.title ||
    candidate.title.length < 3 ||
    candidate.title.startsWith("{") ||
    candidate.title.length > 100 ||
    candidate.title === extractedText.slice(0, candidate.title.length)
  ) {
    candidate = {
      ...candidate,
      title: shortTitleFromSource(params.sourceName, extractedText),
      lowConfidenceFields: [...new Set([...candidate.lowConfidenceFields, "title"])],
    };
  }

  // Limite de caracteres nos candidatos
  let used = candidate.normalizedText.length;
  if (used > MAX_CANDIDATE_TEXT_TOTAL) {
    candidate = {
      ...candidate,
      normalizedText: candidate.normalizedText.slice(0, MAX_CANDIDATE_TEXT_TOTAL),
    };
  }

  const candidates = [candidate].slice(0, MAX_CANDIDATES);
  const conflicts = detectHistoricalConflicts({
    candidates,
    tables,
    tableExpanded: params.tableExpanded,
  });
  const warnings = [...(params.warnings ?? [])];
  if (!params.suggestion.periodFound) {
    warnings.push("Período não identificado com clareza.");
  }
  if (params.tableExpanded) {
    warnings.push("Tabela multi-ano expandida por mês+ano.");
  }

  return {
    sourceName: params.sourceName,
    extractedText,
    candidates,
    tables,
    conflicts,
    warnings,
  };
}

/**
 * Periodo multi-ano so pode sobrescrever quando a expansao tabular realmente rodou
 * e os anos vieram das colunas da tabela — nunca de narrativa 2025/2030.
 */
export function applyTablePeriodIfSafe(
  suggestion: {
    documentType: DocumentType;
    areaId: string | null;
    areaName: string | null;
    period: string;
    periodFound: boolean;
    title: string;
    summary: string;
    confidence: number;
    lowConfidenceFields: string[];
  },
  params: { tableExpanded: boolean; tableYears: number[] },
) {
  if (!params.tableExpanded || params.tableYears.length < 2) return suggestion;
  const years = [...params.tableYears].sort((a, b) => a - b);
  const period = years.length === 1 ? String(years[0]) : `${years[0]}–${years[years.length - 1]}`;
  // Nao sobrescrever se o titulo/periodo atual ja aponta um unico ano diferente e nao ha expansao confiavel
  const currentYears = yearsInText(suggestion.period);
  if (suggestion.periodFound && currentYears.length === 1 && !years.includes(currentYears[0]!)) {
    return {
      ...suggestion,
      lowConfidenceFields: [...new Set([...suggestion.lowConfidenceFields, "period"])],
    };
  }
  return {
    ...suggestion,
    period,
    periodFound: true,
    lowConfidenceFields: suggestion.lowConfidenceFields.filter((field) => field !== "period"),
  };
}
