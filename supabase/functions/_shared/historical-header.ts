export type HistoricalHeaderDocumentType = "strategic" | "quarterly" | "monthly";

export interface HistoricalHeaderEvidence {
  field: string;
  value: string;
  source: "title" | "label" | "body" | "filename" | "ai";
  confidence: number;
  excerpt: string;
}

export interface HistoricalHeaderConflict {
  field: "documentType" | "area" | "year" | "quarter" | "month" | "title" | "company";
  message: string;
  values: string[];
  required: boolean;
}

export interface HistoricalHeaderMetadata {
  documentType: HistoricalHeaderDocumentType | null;
  title: string | null;
  sourceCompany: string | null;
  sourceAreaLabel: string | null;
  matchedAreaId: string | null;
  matchedAreaName: string | null;
  managerName: string | null;
  year: number | null;
  quarter: 1 | 2 | 3 | 4 | null;
  month: number | null;
  primaryPeriod: string;
  sourceVersion: string | null;
  evidence: HistoricalHeaderEvidence[];
  conflicts: HistoricalHeaderConflict[];
}

interface AreaCandidate {
  id: string;
  name: string;
}

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTH_BY_NAME: Record<string, number> = {
  jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3,
  abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6,
  jul: 7, julho: 7, ago: 8, agosto: 8, set: 9, setembro: 9,
  out: 10, outubro: 10, nov: 11, novembro: 11, dez: 12, dezembro: 12,
};

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanValue(value: unknown, max = 160) {
  return String(value ?? "")
    .replace(/^[\s:;|●•-]+|[\s:;|●•-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function logicalHeader(text: string) {
  const prefix = String(text ?? "").replace(/\r\n?/g, "\n").slice(0, 4_000);
  const stop = prefix.search(/(?:^|[\n●•])\s*(?:2[.\s]+)?(?:OBJETIVOS|ACOES|AÇÕES|DIAGNOSTICO|DIAGNÓSTICO|SWOT)\b/i);
  return (stop >= 0 ? prefix.slice(0, stop) : prefix).trim();
}

function extractLabel(header: string, labels: string[]) {
  const labelPattern = labels.join("|");
  const boundary = "(?=\\s*(?:[●•|]|Empresa\\s*:|Departamento\\s*:|Área\\s*:|Area\\s*:|Setor\\s*:|Unidade\\s*:|Gestor(?:a)?\\s*:|Respons[aá]vel\\s*:|M[eê]s\\s*\\/\\s*Ano\\s*:|Compet[eê]ncia\\s*:|Per[ií]odo\\s*:|Trimestre(?:\\s*\\([^)]*\\))?\\s*:|Ano\\s*:|Vers[aã]o\\s*:|Refer[eê]ncia\\s+estrat[eé]gica\\s*:|$))";
  const match = header.match(new RegExp(`(?:${labelPattern})\\s*:\\s*(.{1,180}?)${boundary}`, "i"));
  return cleanValue(match?.[1] ?? "") || null;
}

function monthYear(value: string | null) {
  if (!value) return { month: null as number | null, year: null as number | null };
  const normalized = normalize(value);
  const numeric = normalized.match(/\b(0?[1-9]|1[0-2])\s*[\/.-]\s*(20\d{2})\b/);
  if (numeric) return { month: Number(numeric[1]), year: Number(numeric[2]) };
  const year = normalized.match(/\b(20\d{2})\b/);
  const monthEntry = Object.entries(MONTH_BY_NAME).find(([name]) => new RegExp(`\\b${name}\\b`).test(normalized));
  return { month: monthEntry?.[1] ?? null, year: year ? Number(year[1]) : null };
}

function matchArea(label: string | null, areas: AreaCandidate[]) {
  if (!label) return null;
  const target = normalize(label).replace(/^(departamento|area|setor|unidade)\s+(de\s+)?/, "");
  const exact = areas.find((area) => normalize(area.name) === target);
  if (exact) return exact;
  const targetTokens = new Set(target.split(" ").filter((token) => token.length > 2));
  let best: { area: AreaCandidate; score: number } | null = null;
  for (const area of areas) {
    const tokens = normalize(area.name).split(" ").filter((token) => token.length > 2);
    const shared = tokens.filter((token) => targetTokens.has(token)).length;
    const score = shared / Math.max(tokens.length, targetTokens.size, 1);
    if (score >= 0.75 && (!best || score > best.score)) best = { area, score };
  }
  return best?.area ?? null;
}

function titleFromHeader(header: string, areaLabel: string | null) {
  const titleMatch = header.match(/PLANO\s+(?:MENSAL|TRIMESTRAL|ESTRAT[EÉ]GICO)[\s\S]{0,220}?(?=\s*(?:\(?VERS[AÃ]O\b|[●•]|(?:1[.\s]+)?CONTEXTO\b|Empresa\s*:|$))/i);
  if (!titleMatch) return null;
  let title = cleanValue(titleMatch[0], 220)
    .replace(/\s*\(?VERS[AÃ]O[\s\S]*$/i, "")
    .replace(/\s*[–—-]\s*(?:jan(?:eiro)?|fev(?:ereiro)?|mar(?:ço|co)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)\s*[\/.-]?\s*20\d{2}\s*$/i, "")
    .replace(/\s*[–—-]\s*(?:T[1-4]\s*)?20\d{2}\s*$/i, "");
  if (areaLabel) {
    const escaped = areaLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    title = title.replace(new RegExp(`\\s*[–—-]\\s*${escaped}\\s*$`, "i"), "");
  }
  title = cleanValue(title, 100);
  if (!title) return null;
  return title.charAt(0).toUpperCase() + title.slice(1).toLocaleLowerCase("pt-BR");
}

export function extractHistoricalHeaderMetadata(
  text: string,
  fileName: string | null | undefined,
  areas: AreaCandidate[],
  activeCompanyName?: string | null,
): HistoricalHeaderMetadata {
  const header = logicalHeader(text);
  const normalizedHeader = normalize(header);
  const evidence: HistoricalHeaderEvidence[] = [];
  const conflicts: HistoricalHeaderConflict[] = [];
  const addEvidence = (field: string, value: unknown, source: HistoricalHeaderEvidence["source"], confidence: number, excerpt: string) => {
    const clean = cleanValue(value);
    if (clean) evidence.push({ field, value: clean, source, confidence, excerpt: cleanValue(excerpt, 220) });
  };

  let documentType: HistoricalHeaderDocumentType | null = null;
  if (/\bplano mensal\b/.test(normalizedHeader)) documentType = "monthly";
  else if (/\bplano trimestral\b/.test(normalizedHeader)) documentType = "quarterly";
  else if (/\bplano estrategico\b/.test(normalizedHeader)) documentType = "strategic";
  if (documentType) addEvidence("documentType", documentType, "title", 0.99, header.slice(0, 240));

  const sourceCompany = extractLabel(header, ["Empresa"]);
  const sourceAreaLabel = extractLabel(header, ["Departamento", "Área", "Area", "Setor", "Unidade"]);
  const managerName = extractLabel(header, ["Gestora", "Gestor", "Responsável", "Responsavel"]);
  const explicitPeriod = extractLabel(header, ["Mês\\s*\\/\\s*Ano", "Mes\\s*\\/\\s*Ano", "Competência", "Competencia", "Período", "Periodo"]);
  const explicitYear = extractLabel(header, ["Ano"]);
  const explicitQuarter = header.match(/Trimestre(?:\s*\([^)]*\))?\s*:\s*[^T0-9]{0,20}T?([1-4])\b/i)?.[1]
    ?? header.match(/Trimestre\s*\(\s*T([1-4])\b/i)?.[1]
    ?? null;
  const titleQuarter = header.slice(0, 300).match(/(?:^|[–—\-\s])T([1-4])(?:\s|[\/-])*20\d{2}\b/i)?.[1] ?? null;
  const sourceVersionRaw = extractLabel(header, ["Versão", "Versao"])
    ?? cleanValue(header.match(/\(?VERS[AÃ]O\s+([^)]{2,80})\)?/i)?.[1] ?? "")
    ?? null;
  const sourceVersion = sourceVersionRaw
    ? sourceVersionRaw.charAt(0).toLocaleUpperCase("pt-BR") + sourceVersionRaw.slice(1).toLocaleLowerCase("pt-BR")
    : null;

  if (sourceCompany) addEvidence("sourceCompany", sourceCompany, "label", 0.98, `Empresa: ${sourceCompany}`);
  if (sourceAreaLabel) addEvidence("area", sourceAreaLabel, "label", 0.99, `Departamento/Área: ${sourceAreaLabel}`);
  if (managerName) addEvidence("managerName", managerName, "label", 0.98, `Gestor(a): ${managerName}`);
  if (sourceVersion) addEvidence("sourceVersion", sourceVersion, "title", 0.95, `Versão: ${sourceVersion}`);

  const titlePeriod = monthYear(header.slice(0, 300));
  const labeledPeriod = monthYear(explicitPeriod);
  const yearFromLabel = explicitYear?.match(/\b20\d{2}\b/)?.[0];
  const month = labeledPeriod.month ?? titlePeriod.month;
  const year = labeledPeriod.year ?? (yearFromLabel ? Number(yearFromLabel) : null) ?? titlePeriod.year;
  const derivedQuarter = month ? (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4 : null;
  const quarterValue = explicitQuarter ?? titleQuarter;
  const quarter = quarterValue ? Number(quarterValue) as 1 | 2 | 3 | 4 : derivedQuarter;
  if (month && year) addEvidence("month", `${MONTHS[month - 1]} ${year}`, explicitPeriod ? "label" : "title", explicitPeriod ? 0.99 : 0.94, explicitPeriod ?? header.slice(0, 220));
  if (explicitQuarter) addEvidence("quarter", `T${explicitQuarter}${year ? ` ${year}` : ""}`, "label", 0.98, `Trimestre T${explicitQuarter}`);
  else if (titleQuarter) addEvidence("quarter", `T${titleQuarter}${year ? ` ${year}` : ""}`, "title", 0.94, header.slice(0, 220));
  if (explicitQuarter && derivedQuarter && Number(explicitQuarter) !== derivedQuarter) {
    conflicts.push({
      field: "quarter",
      message: `O mês indica T${derivedQuarter}, mas o cabeçalho informa T${explicitQuarter}. Confirme o trimestre.`,
      values: [`T${derivedQuarter}`, `T${explicitQuarter}`],
      required: true,
    });
  }

  const matchedArea = matchArea(sourceAreaLabel, areas);
  if (sourceAreaLabel && !matchedArea) {
    conflicts.push({
      field: "area",
      message: `A área “${sourceAreaLabel}” não corresponde com segurança a uma área ativa. Escolha o escopo.`,
      values: [sourceAreaLabel],
      required: true,
    });
  }
  if (sourceCompany && activeCompanyName) {
    const sourceNormalized = normalize(sourceCompany);
    const activeNormalized = normalize(activeCompanyName);
    const sameCompany = sourceNormalized === activeNormalized || sourceNormalized.includes(activeNormalized) || activeNormalized.includes(sourceNormalized);
    if (!sameCompany) {
      conflicts.push({
        field: "company",
        message: `O documento cita “${sourceCompany}”, diferente da empresa ativa “${activeCompanyName}”. Confirme antes de salvar.`,
        values: [sourceCompany, activeCompanyName],
        required: true,
      });
    }
  }

  let primaryPeriod = "";
  if (documentType === "monthly" && month && year) primaryPeriod = `${MONTHS[month - 1]} ${year}`;
  else if (documentType === "quarterly" && quarter && year) primaryPeriod = `T${quarter} ${year}`;
  else if (documentType === "strategic" && year) primaryPeriod = String(year);
  else if (month && year) primaryPeriod = `${MONTHS[month - 1]} ${year}`;
  else if (quarter && year) primaryPeriod = `T${quarter} ${year}`;
  else if (year) primaryPeriod = String(year);

  const title = titleFromHeader(header, sourceAreaLabel);
  if (title) addEvidence("title", title, "title", 0.96, header.slice(0, 240));

  return {
    documentType,
    title,
    sourceCompany,
    sourceAreaLabel,
    matchedAreaId: matchedArea?.id ?? null,
    matchedAreaName: matchedArea?.name ?? null,
    managerName,
    year,
    quarter,
    month,
    primaryPeriod,
    sourceVersion,
    evidence: evidence.slice(0, 24),
    conflicts,
  };
}
