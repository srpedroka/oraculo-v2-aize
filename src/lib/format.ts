export function formatDate(date: string | null | undefined) {
  if (!date) return "Sem prazo";
  const parsed = new Date(date.includes("T") ? date : `${date}T00:00:00`);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

export function shortDate(date: string | null | undefined) {
  if (!date) return "Sem prazo";
  const parsed = new Date(date.includes("T") ? date : `${date}T00:00:00`);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(parsed);
}
