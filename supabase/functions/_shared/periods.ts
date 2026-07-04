const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const MONTH_BY_TEXT: Record<string, number> = {
  jan: 0,
  janeiro: 0,
  fev: 1,
  fevereiro: 1,
  mar: 2,
  marco: 2,
  março: 2,
  abr: 3,
  abril: 3,
  mai: 4,
  maio: 4,
  jun: 5,
  junho: 5,
  jul: 6,
  julho: 6,
  ago: 7,
  agosto: 7,
  set: 8,
  setembro: 8,
  out: 9,
  outubro: 9,
  nov: 10,
  novembro: 10,
  dez: 11,
  dezembro: 11,
};

export function normalizeTextForRouting(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function currentYear(date = new Date()) {
  return date.getFullYear();
}

export function currentQuarterPeriod(date = new Date()) {
  return `T${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
}

export function currentMonthPeriod(date = new Date()) {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function inferPlanningType(text: string): "strategic" | "quarterly" | "monthly" | null {
  const normalized = normalizeTextForRouting(text);
  if (/\b(estrateg|anual|ano|planejamento da empresa|plano da empresa)\b/.test(normalized)) return "strategic";
  if (/\b(t[1-4]|q[1-4]|tri|trimestre|trimestral)\b/.test(normalized)) return "quarterly";
  if (/\b(mes|mensal|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|abr|mai|jun|jul|ago|set|out|nov|dez)\b/.test(normalized)) return "monthly";
  return null;
}

function yearFromText(text: string) {
  const match = text.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : currentYear();
}

function monthFromText(text: string) {
  const normalized = normalizeTextForRouting(text);
  for (const [name, index] of Object.entries(MONTH_BY_TEXT)) {
    if (new RegExp(`\\b${name}\\b`).test(normalized)) return index;
  }
  return null;
}

function quarterFromText(text: string) {
  const normalized = normalizeTextForRouting(text);
  const direct = normalized.match(/\b[qt]([1-4])\b/);
  if (direct) return Number(direct[1]);
  const ordinal = normalized.match(/\b([1-4])(?:o|º)?\s*tri/);
  if (ordinal) return Number(ordinal[1]);
  return null;
}

export function periodForPlanning(type: "strategic" | "quarterly" | "monthly", hint: string | null | undefined, sourceText = "") {
  const text = [hint, sourceText].filter(Boolean).join(" ");
  const year = yearFromText(text);

  if (type === "strategic") return String(year);

  if (type === "quarterly") {
    const quarter = quarterFromText(text) ?? Math.floor(new Date().getMonth() / 3) + 1;
    return `T${quarter} ${year}`;
  }

  const month = monthFromText(text) ?? new Date().getMonth();
  return `${MONTHS[month]} ${year}`;
}
