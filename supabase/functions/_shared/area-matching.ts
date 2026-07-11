export interface NamedAreaCandidate {
  id: string;
  name: string;
}

export interface AreaMatch<T extends NamedAreaCandidate> {
  area: T | null;
  confidence: number;
  strategy: "exact" | "contained" | "semantic" | "tokens" | "none";
  ambiguous: T[];
}

const AREA_CONCEPTS: Record<string, string[]> = {
  operations: ["producao", "produtivo", "industrial", "industria", "fabril", "fabrica", "manufatura", "manufacturing", "operacoes"],
  sales: ["comercial", "vendas", "sales", "negocios"],
  marketing: ["marketing", "mercado", "marca", "branding", "comunicacao"],
  finance: ["financeiro", "financeira", "financas", "controladoria", "contabil", "contabilidade", "tesouraria"],
  people: ["rh", "recursos humanos", "gestao de pessoas", "gente", "pessoas", "people"],
  technology: ["ti", "tecnologia", "sistemas", "digital", "software", "dados"],
  logistics: ["logistica", "distribuicao", "expedicao", "transportes", "supply chain", "cadeia de suprimentos"],
  purchasing: ["compras", "suprimentos", "procurement", "sourcing"],
  quality: ["qualidade", "quality", "sgq"],
  engineering: ["engenharia", "engineering", "projetos tecnicos"],
  innovation: ["inovacao", "pesquisa e desenvolvimento", "p d", "research development"],
  service: ["atendimento", "sucesso do cliente", "customer success", "sac", "pos venda"],
  legal: ["juridico", "legal", "compliance", "governanca"],
};

const GENERIC_TOKENS = new Set(["area", "departamento", "setor", "unidade", "diretoria", "gerencia", "gestao", "de", "da", "do", "e"]);

export function normalizeAreaName(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:area|departamento|setor|unidade|diretoria|gerencia)\s+(?:de\s+|da\s+|do\s+)?/, "");
}

function conceptsFor(value: string) {
  const padded = ` ${value} `;
  return Object.entries(AREA_CONCEPTS)
    .filter(([, aliases]) => aliases.some((alias) => padded.includes(` ${alias} `)))
    .map(([concept]) => concept);
}

function tokensFor(value: string) {
  return new Set(value.split(" ").filter((token) => token.length > 1 && !GENERIC_TOKENS.has(token)));
}

function scoreArea(source: string, candidate: string): { score: number; strategy: AreaMatch<NamedAreaCandidate>["strategy"] } {
  if (source === candidate) return { score: 1, strategy: "exact" };
  if (source.length >= 4 && candidate.length >= 4 && (source.includes(candidate) || candidate.includes(source))) {
    return { score: 0.9, strategy: "contained" };
  }

  const sourceConcepts = conceptsFor(source);
  const candidateConcepts = conceptsFor(candidate);
  if (sourceConcepts.some((concept) => candidateConcepts.includes(concept))) {
    return { score: 0.88, strategy: "semantic" };
  }

  const sourceTokens = tokensFor(source);
  const candidateTokens = tokensFor(candidate);
  const shared = [...sourceTokens].filter((token) => candidateTokens.has(token)).length;
  const score = shared / Math.max(sourceTokens.size, candidateTokens.size, 1);
  return { score, strategy: "tokens" };
}

export function matchAreaCandidate<T extends NamedAreaCandidate>(value: unknown, areas: T[]): AreaMatch<T> {
  const source = normalizeAreaName(value);
  if (!source || !areas.length) return { area: null, confidence: 0, strategy: "none", ambiguous: [] };

  const scored = areas
    .map((area) => ({ area, ...scoreArea(source, normalizeAreaName(area.name)) }))
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  const tied = scored.filter((item) => item.score >= 0.72 && best.score - item.score < 0.12);
  if (best.score < 0.72 || tied.length > 1) {
    return { area: null, confidence: best.score, strategy: best.strategy, ambiguous: tied.map((item) => item.area) };
  }
  return { area: best.area, confidence: best.score, strategy: best.strategy, ambiguous: [] };
}
