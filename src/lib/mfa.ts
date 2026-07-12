export function normalizeTotpCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function totpQrDataUrl(svg: string) {
  if (svg.startsWith("data:image/svg+xml")) return svg;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
