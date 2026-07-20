export function normalizeWhatsAppText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function whatsappFileExtension(fileName: string) {
  return fileName.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
}

export function isWhatsAppPlainTextDocument(fileName: string, mimeType: string) {
  const extension = whatsappFileExtension(fileName);
  return [".txt", ".md", ".markdown"].includes(extension) ||
    mimeType.toLowerCase().startsWith("text/");
}

export function extractWhatsAppPlainTextDocument(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
) {
  if (!isWhatsAppPlainTextDocument(fileName, mimeType)) return null;
  const normalized = new TextDecoder()
    .decode(bytes)
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized || normalized.length < 20) {
    throw new Error("O arquivo de texto está vazio.");
  }
  return normalized;
}
