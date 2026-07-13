import { normalizePhone, phonesMayMatch } from "./phone.ts";
import { decodeBase64Audio } from "./transcription.ts";
import { buildWhatsAppFallbackEventKey, type WhatsAppInboundKind } from "./whatsapp-queue.ts";

export function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" || typeof value === "number") {
      const text = String(value).trim();
      if (text) return text;
    }
  }

  return "";
}

export function extractText(payload: any) {
  const data = payload?.Data ?? payload?.data ?? payload;
  const message = data?.Message ?? data?.message ?? payload?.Message ?? payload?.message;

  return firstText(
    message?.conversation,
    message?.extendedTextMessage?.text,
    message?.imageMessage?.caption,
    message?.videoMessage?.caption,
    message?.documentMessage?.caption,
    message?.text,
    data?.message?.conversation,
    data?.message?.extendedTextMessage?.text,
    data?.message?.text,
    data?.Text,
    data?.text,
    payload?.Text,
    payload?.text,
    typeof payload?.message === "string" ? payload.message : "",
  );
}

function messageParts(payload: any) {
  const data = payload?.Data ?? payload?.data ?? payload;
  const message = data?.Message ?? data?.message ?? payload?.Message ?? payload?.message;
  const info = data?.Info ?? data?.info ?? payload?.Info ?? payload?.info;
  const key = data?.key ?? data?.Key ?? payload?.key ?? payload?.Key ?? info?.Key ?? info?.key;

  return { data, message, info, key };
}

export function extractWebhookMessageId(payload: any) {
  const { data, info, key } = messageParts(payload);
  return firstText(
    key?.id,
    key?.Id,
    key?.ID,
    info?.ID,
    info?.Id,
    info?.id,
    info?.MessageID,
    info?.messageId,
    info?.message_id,
    data?.ID,
    data?.Id,
    data?.id,
    data?.messageId,
    data?.message_id,
    payload?.ID,
    payload?.Id,
    payload?.id,
    payload?.messageId,
    payload?.message_id,
  );
}

export async function buildWebhookEventKey(payload: any, phone: string, text: string, hasAudio: boolean, hasDocument: boolean) {
  const messageId = extractWebhookMessageId(payload);
  if (messageId) return `message:${phone}:${messageId}`;

  const kind: WhatsAppInboundKind = hasDocument ? "document" : hasAudio ? "audio" : "text";
  return buildWhatsAppFallbackEventKey(phone, kind, text);
}

function toBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["true", "1", "yes", "sim"].includes(normalized);
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function buildEvolutionMessageKey(data: any, info: any, key: any, messageId: string) {
  const remoteJid = firstText(
    key?.remoteJid,
    key?.RemoteJid,
    key?.RemoteJID,
    info?.Chat,
    info?.chat,
    info?.RemoteJid,
    info?.remoteJid,
    data?.remoteJid,
    data?.RemoteJid,
  );
  const id = firstText(key?.id, key?.Id, key?.ID, info?.ID, info?.Id, info?.id, messageId);
  const participant = firstText(key?.participant, key?.Participant, info?.Sender, info?.sender);
  const fromMeValue = firstValue(key?.fromMe, key?.FromMe, info?.IsFromMe, info?.isFromMe);
  const fromMe = toBoolean(fromMeValue);

  return {
    ...(remoteJid ? { remoteJid } : {}),
    fromMe,
    ...(id ? { id } : {}),
    ...(participant ? { participant } : {}),
  };
}

function extractSender(payload: any) {
  const { data, info, key } = messageParts(payload);
  const candidates = [
    info?.Sender,
    info?.sender,
    info?.Participant,
    info?.participant,
    info?.SenderAlt,
    key?.participant,
    key?.Participant,
    data?.sender,
    data?.Sender,
    payload?.sender,
    payload?.Sender,
  ];

  return candidates.find((candidate) => normalizePhone(candidate)) ?? "";
}

export function isMessageFromCurrentInstance(payload: any, settings: any) {
  const { data, info, key } = messageParts(payload);
  const fromMeValue = firstValue(
    key?.fromMe,
    key?.FromMe,
    info?.IsFromMe,
    info?.isFromMe,
    data?.IsFromMe,
    data?.isFromMe,
    payload?.IsFromMe,
    payload?.isFromMe,
  );
  if (toBoolean(fromMeValue)) return true;

  const sender = extractSender(payload);
  return Boolean(sender && settings?.connected_number && phonesMayMatch(sender, settings.connected_number));
}

export function extractAudioInfo(payload: any) {
  const { data, message, info, key } = messageParts(payload);
  const audioMessage =
    message?.audioMessage ??
    message?.AudioMessage ??
    message?.pttMessage ??
    message?.PTTMessage ??
    data?.audioMessage ??
    data?.AudioMessage ??
    payload?.audioMessage ??
    payload?.AudioMessage ??
    null;

  const base64 = firstText(
    audioMessage?.base64,
    audioMessage?.Base64,
    audioMessage?.media,
    audioMessage?.Media,
    data?.base64,
    data?.Base64,
    data?.media,
    data?.Media,
    data?.mediaBase64,
    payload?.base64,
    payload?.Base64,
    payload?.mediaBase64,
  );

  const url = firstText(
    audioMessage?.url,
    audioMessage?.URL,
    audioMessage?.mediaUrl,
    audioMessage?.MediaUrl,
    audioMessage?.media_url,
    data?.mediaUrl,
    data?.MediaUrl,
    payload?.mediaUrl,
    payload?.MediaUrl,
  );

  const mimeType = firstText(audioMessage?.mimetype, audioMessage?.mimeType, audioMessage?.MimeType, data?.mimetype) || "audio/ogg";
  const messageId = firstText(
    info?.ID,
    info?.Id,
    info?.id,
    info?.MessageID,
    info?.MessageId,
    info?.messageId,
    key?.id,
    key?.Id,
    key?.ID,
    data?.messageId,
    payload?.messageId,
  );
  const messageKey = buildEvolutionMessageKey(data, info, key, messageId);

  return audioMessage || base64 || url ? { audioMessage, base64, url, mimeType, messageId, key: messageKey, rawMessage: message, rawData: data } : null;
}

export function extractDocumentInfo(payload: any) {
  const { data, message, info, key } = messageParts(payload);
  const documentMessage =
    message?.documentMessage ??
    message?.DocumentMessage ??
    data?.documentMessage ??
    data?.DocumentMessage ??
    payload?.documentMessage ??
    payload?.DocumentMessage ??
    null;

  const base64 = firstText(
    documentMessage?.base64,
    documentMessage?.Base64,
    documentMessage?.media,
    documentMessage?.Media,
    data?.base64,
    data?.Base64,
    data?.media,
    data?.Media,
    payload?.base64,
    payload?.Base64,
  );

  const url = firstText(
    documentMessage?.url,
    documentMessage?.URL,
    documentMessage?.mediaUrl,
    documentMessage?.MediaUrl,
    documentMessage?.media_url,
    data?.mediaUrl,
    data?.MediaUrl,
    payload?.mediaUrl,
    payload?.MediaUrl,
  );

  const mimeType =
    firstText(documentMessage?.mimetype, documentMessage?.mimeType, documentMessage?.MimeType, data?.mimetype, payload?.mimetype) ||
    "application/octet-stream";
  const fileName =
    firstText(
      documentMessage?.fileName,
      documentMessage?.filename,
      documentMessage?.FileName,
      documentMessage?.title,
      documentMessage?.Title,
      data?.fileName,
      data?.filename,
      payload?.fileName,
      payload?.filename,
    ) || `arquivo-${Date.now()}`;
  const messageId = firstText(info?.ID, info?.Id, info?.id, key?.id, key?.Id, key?.ID, data?.messageId, payload?.messageId);
  const messageKey = buildEvolutionMessageKey(data, info, key, messageId);

  return documentMessage || base64 || url
    ? { documentMessage, base64, url, mimeType, fileName, messageId, key: messageKey, rawMessage: message, rawData: data }
    : null;
}

export function extractRemote(payload: any) {
  const data = payload?.Data ?? payload?.data ?? payload;
  const info = data?.Info ?? data?.info ?? payload?.Info ?? payload?.info;
  const key = data?.key ?? data?.Key ?? payload?.key ?? payload?.Key;
  const candidates = [
    info?.Chat,
    info?.Sender,
    info?.SenderAlt,
    info?.ChatAlt,
    info?.RemoteJid,
    info?.remoteJid,
    key?.remoteJid,
    key?.RemoteJid,
    data?.remoteJid,
    data?.RemoteJid,
    data?.from,
    data?.From,
    data?.sender,
    data?.Sender,
    payload?.sender,
    payload?.Sender,
    payload?.from,
    payload?.From,
    payload?.phone,
    payload?.Phone,
  ];

  return candidates.find((candidate) => normalizePhone(candidate)) ?? "";
}

export function audioFileFromBase64(base64: string, mimeType: string) {
  try {
    return decodeBase64Audio(base64, mimeType);
  } catch (error) {
    console.error("Erro ao decodificar áudio em base64", error instanceof Error ? error.message : String(error));
    return null;
  }
}

export function mediaFileFromBase64(base64: string, mimeType: string, fileName: string) {
  const clean = base64.includes(",") ? base64.split(",").pop() ?? "" : base64;
  const binary = atob(clean.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { bytes, mimeType, fileName };
}

// Comparacao em tempo constante para o segredo do webhook (evita timing attack).
export function timingSafeEqual(a: string, b: string) {
  const encoder = new TextEncoder();
  const bufferA = encoder.encode(a);
  const bufferB = encoder.encode(b);
  let mismatch = bufferA.length ^ bufferB.length;
  const length = Math.max(bufferA.length, bufferB.length);
  for (let i = 0; i < length; i += 1) {
    mismatch |= (bufferA[i] ?? 0) ^ (bufferB[i] ?? 0);
  }
  return mismatch === 0;
}

export async function deriveEvoGoWebhookToken(webhookSecret: string, orgId: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(webhookSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`evo-go:${orgId}`)));
  return [...signature].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Teto de tamanho para download de midia recebida por webhook (evita esgotar memoria).
