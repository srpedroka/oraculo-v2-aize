export type WhatsAppInboundKind = "text" | "audio" | "document";

export async function buildWhatsAppFallbackEventKey(
  phone: string,
  kind: WhatsAppInboundKind,
  text: string,
  receivedAt = new Date(),
) {
  const minute = receivedAt.toISOString().slice(0, 16);
  const normalizedText = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim() || "media";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${phone}|${kind}|${normalizedText}|${minute}`),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `fallback:${phone}:${kind}:${minute}:${hash}`;
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function addText(target: Record<string, string>, key: string, value: unknown, maxLength: number) {
  const cleaned = cleanText(value, maxLength);
  if (cleaned) target[key] = cleaned;
}

export function sanitizeWhatsAppInboundPayload(kind: WhatsAppInboundKind, candidate: Record<string, unknown>) {
  const payload: Record<string, string> = {};
  addText(payload, "messageId", candidate.messageId, 300);

  if (kind === "text") {
    addText(payload, "text", candidate.text, 12_000);
    return payload;
  }

  addText(payload, "remoteJid", candidate.remoteJid, 300);
  addText(payload, "mimeType", candidate.mimeType, 180);
  addText(payload, "fileName", candidate.fileName, 240);
  addText(payload, "caption", candidate.caption, 2_000);
  return payload;
}
