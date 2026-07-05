const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function currentYear(date = new Date()) {
  return date.getFullYear();
}

// Formato canonico do trimestre gravado pelo servidor (_shared/periods.ts): "T3 2026".
// Manter aqui em sincronia; nao usar "Q" no cliente, senao os filtros nao batem com o que e persistido.
export function currentQuarterPeriod(date = new Date()) {
  return `T${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
}

export function currentMonthPeriod(date = new Date()) {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function previousMonthPeriod(date = new Date()) {
  const previous = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return `${MONTHS[previous.getMonth()]} ${previous.getFullYear()}`;
}
