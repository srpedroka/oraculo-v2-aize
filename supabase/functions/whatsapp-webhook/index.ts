import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serviceClient } from "../_shared/auth.ts";
import { resolveAiFunction } from "../_shared/ai-router.ts";
import {
  conversationMessagesForModel,
  formatConversationMemory,
  getOrCreateConversation,
  insertConversationMessage,
  loadConversationHistory,
  maybeSummarize,
  type ConversationHistory,
  type ConversationRecord,
} from "../_shared/conversations.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callModelForFunction } from "../_shared/call-for-function.ts";
import { buildPlanContext } from "../_shared/plan-context.ts";
import { renderPlanForWhatsApp } from "../_shared/plan-render.ts";
import { PERSONA_ORACULO } from "../_shared/conductors/persona.ts";
import { loadOrgTone, toneDirective } from "../_shared/conductors/tone.ts";
import { classifyOracleIntent } from "../_shared/intent-router.ts";
import { periodForClose, periodForPlanning } from "../_shared/periods.ts";
import { handleQuickUpdate } from "../_shared/quick-updates.ts";
import { decodeBase64Audio, normalizeAudioFile, transcribeAudioWithOpenAi, type AudioFile } from "../_shared/transcription.ts";
import { recordAiUsage } from "../_shared/usage.ts";
import { evaluateAiControls, isAiControlLimitError } from "../_shared/ai-controls.ts";
import { formatForWhatsApp, sendWhatsAppMessages } from "../_shared/whatsapp.ts";
import { isExplicitPlanningResume } from "../_shared/conversation-policy.ts";
import {
  confirmPlanningProposal,
  prepareReadyMonthlyPlanProposal,
  prepareReadyQuarterlyPlanProposal,
  prepareReadyStrategicPlanProposal,
  processPlanningMessage,
  startPlanningSession,
} from "../_shared/session-engine.ts";
import {
  assertSafeStructuredValue,
  formatUntrustedDocument,
  importedConversationReceipt,
  UNTRUSTED_CONTENT_RULES,
} from "../_shared/untrusted-content.ts";
import {
  buildWhatsAppFallbackEventKey,
  sanitizeWhatsAppInboundPayload,
  type WhatsAppInboundKind,
} from "../_shared/whatsapp-queue.ts";

function normalizePhone(value: unknown) {
  const source = String(value ?? "").trim();
  if (!source || source.includes("@lid")) return null;

  const raw = source.split("@")[0].split(":")[0];
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 8 ? `+${digits}` : null;
}

function phoneCandidates(value: unknown) {
  const normalized = normalizePhone(value);
  if (!normalized) return [];

  const candidates = new Set<string>();
  const add = (digits: string) => {
    const clean = digits.replace(/\D/g, "");
    if (clean.length >= 8) candidates.add(`+${clean}`);
  };

  const digits = normalized.replace(/\D/g, "");
  add(digits);
  add(digits.replace(/^0+/, ""));

  const national = digits.startsWith("55") ? digits.slice(2).replace(/^0+/, "") : digits.replace(/^0+/, "");
  if (national.length >= 10 && national.length <= 11) add(`55${national}`);

  // Brazil mobile numbers can arrive with or without the ninth digit after the DDD.
  if (national.length === 10) add(`55${national.slice(0, 2)}9${national.slice(2)}`);
  if (national.length === 11 && national[2] === "9") add(`55${national.slice(0, 2)}${national.slice(3)}`);

  return [...candidates];
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" || typeof value === "number") {
      const text = String(value).trim();
      if (text) return text;
    }
  }

  return "";
}

function isConfirmationMessage(value: string) {
  const normalized = normalizeText(value);
  return /\b(confirmo|confirmar|gravar|salvar|pode gravar|pode salvar|sim|ok|fechado)\b/.test(normalized);
}

function extractText(payload: any) {
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

function extractWebhookMessageId(payload: any) {
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

async function buildWebhookEventKey(payload: any, phone: string, text: string, hasAudio: boolean, hasDocument: boolean) {
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

function phonesMayMatch(a: unknown, b: unknown) {
  const aCandidates = new Set(phoneCandidates(a).map((phone) => phone.replace(/\D/g, "")));
  const bCandidates = phoneCandidates(b).map((phone) => phone.replace(/\D/g, ""));
  return bCandidates.some((phone) => aCandidates.has(phone));
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

function isMessageFromCurrentInstance(payload: any, settings: any) {
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

function extractAudioInfo(payload: any) {
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

function extractDocumentInfo(payload: any) {
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

function extractRemote(payload: any) {
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

function audioFileFromBase64(base64: string, mimeType: string) {
  try {
    return decodeBase64Audio(base64, mimeType);
  } catch (error) {
    console.error("Erro ao decodificar áudio em base64", error instanceof Error ? error.message : String(error));
    return null;
  }
}

function mediaFileFromBase64(base64: string, mimeType: string, fileName: string) {
  const clean = base64.includes(",") ? base64.split(",").pop() ?? "" : base64;
  const binary = atob(clean.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { bytes, mimeType, fileName };
}

// Comparacao em tempo constante para o segredo do webhook (evita timing attack).
function timingSafeEqual(a: string, b: string) {
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

async function deriveEvoGoWebhookToken(webhookSecret: string, orgId: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(webhookSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`evo-go:${orgId}`)));
  return [...signature].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Teto de tamanho para download de midia recebida por webhook (evita esgotar memoria).
const MAX_MEDIA_DOWNLOAD_BYTES = 25 * 1024 * 1024;

// Anti-SSRF: so permite http(s) para hosts publicos. Bloqueia loopback, redes privadas,
// link-local (inclui o metadata 169.254.169.254 de cloud) e nomes internos.
function isSafeMediaUrl(rawUrl: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return null;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 127 || a === 10 || a === 0) return null; // loopback, privada, "this host"
    if (a === 169 && b === 254) return null; // link-local + metadata cloud
    if (a === 172 && b >= 16 && b <= 31) return null; // privada
    if (a === 192 && b === 168) return null; // privada
    if (a === 100 && b >= 64 && b <= 127) return null; // CGNAT
    if (a >= 224) return null; // multicast/reservado
  }
  // IPv6 loopback/link-local/ULA.
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return null;
  return parsed;
}

// So anexa a apikey da Evolution quando o download e no proprio host da instancia,
// nunca para uma URL de CDN/host arbitrario vinda do payload.
function mediaFetchHeaders(target: URL, keyRow: any, allowedApiKeyHost?: string | null) {
  if (keyRow?.api_key && allowedApiKeyHost && target.hostname.toLowerCase() === allowedApiKeyHost.toLowerCase()) {
    return { apikey: keyRow.api_key as string };
  }
  return undefined;
}

function hostFromInstanceUrl(settings: any): string | null {
  try {
    return new URL(String(settings?.instance_url ?? "")).hostname.toLowerCase();
  } catch {
    return null;
  }
}

async function readCappedBytes(response: Response, diagnostics?: string[]): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared && declared > MAX_MEDIA_DOWNLOAD_BYTES) {
    diagnostics?.push(`media-too-large:${declared}`);
    return null;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_MEDIA_DOWNLOAD_BYTES) {
    diagnostics?.push(`media-too-large:${bytes.length}`);
    return null;
  }
  return bytes;
}

async function downloadAudioFromUrl(url: string, keyRow: any, mimeType: string, diagnostics?: string[], allowedApiKeyHost?: string | null): Promise<AudioFile | null> {
  const target = isSafeMediaUrl(url);
  if (!target) {
    diagnostics?.push("url:blocked");
    return null;
  }
  const response = await fetch(target, {
    headers: mediaFetchHeaders(target, keyRow, allowedApiKeyHost),
    redirect: "manual",
  }).catch(() => null);
  if (!response?.ok) {
    diagnostics?.push(`url:${response?.status ?? "no-response"}`);
    return null;
  }

  const contentType = response.headers.get("content-type") ?? mimeType;
  const bytes = await readCappedBytes(response, diagnostics);
  if (!bytes) return null;
  return {
    bytes,
    mimeType: contentType || mimeType,
    fileName: contentType.includes("mpeg") ? "whatsapp-audio.mp3" : "whatsapp-audio.ogg",
  };
}

async function downloadMediaFromUrl(url: string, keyRow: any, mimeType: string, fileName: string, diagnostics?: string[], allowedApiKeyHost?: string | null): Promise<AudioFile | null> {
  const target = isSafeMediaUrl(url);
  if (!target) {
    diagnostics?.push("doc-url:blocked");
    return null;
  }
  const response = await fetch(target, {
    headers: mediaFetchHeaders(target, keyRow, allowedApiKeyHost),
    redirect: "manual",
  }).catch(() => null);
  if (!response?.ok) {
    diagnostics?.push(`doc-url:${response?.status ?? "no-response"}`);
    return null;
  }

  const bytes = await readCappedBytes(response, diagnostics);
  if (!bytes) return null;
  return {
    bytes,
    mimeType: response.headers.get("content-type") ?? mimeType,
    fileName,
  };
}

function extractBase64FromMediaResponse(value: any) {
  return firstText(
    value?.base64,
    value?.Base64,
    value?.media,
    value?.Media,
    value?.file,
    value?.File,
    value?.data?.base64,
    value?.data?.Base64,
    value?.data?.media,
    value?.data?.Media,
    value?.data?.file,
    value?.data?.File,
    value?.data?.data,
    value?.data?.message?.base64,
    value?.data?.message?.Base64,
  );
}

function extractUrlFromMediaResponse(value: any) {
  return firstText(
    value?.url,
    value?.URL,
    value?.mediaUrl,
    value?.MediaUrl,
    value?.downloadUrl,
    value?.DownloadUrl,
    value?.downloadURL,
    value?.data?.url,
    value?.data?.URL,
    value?.data?.mediaUrl,
    value?.data?.MediaUrl,
    value?.data?.downloadUrl,
    value?.data?.DownloadUrl,
    value?.data?.downloadURL,
    value?.data?.message?.url,
    value?.data?.message?.URL,
  );
}

function jsonShape(value: any) {
  if (!value || typeof value !== "object") return typeof value;
  const keys = Object.keys(value).slice(0, 8).join(",");
  const dataKeys = value.data && typeof value.data === "object" ? `;data:${Object.keys(value.data).slice(0, 8).join(",")}` : "";
  return `${keys}${dataKeys}`;
}

function bytesToAscii(bytes: Uint8Array) {
  const sample = bytes.slice(0, Math.min(bytes.length, 12000));
  if (sample.some((byte) => byte === 0 || byte > 127)) return "";
  return new TextDecoder().decode(sample).trim();
}

function looksLikeBase64(text: string) {
  const clean = text.includes(",") ? text.split(",").pop() ?? "" : text;
  return clean.length > 120 && /^[A-Za-z0-9+/=\s]+$/.test(clean);
}

function byteSignature(bytes: Uint8Array) {
  return Array.from(bytes.slice(0, 8))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function asciiSignature(bytes: Uint8Array) {
  return Array.from(bytes.slice(0, 4))
    .map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : "."))
    .join("");
}

function fileExtension(fileName: string) {
  return fileName.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
}

function looksLikeZip(bytes: Uint8Array) {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function looksLikePdf(bytes: Uint8Array) {
  return asciiSignature(bytes).startsWith("%PDF");
}

function looksLikeDocumentBytes(bytes: Uint8Array, fileName: string, mimeType: string) {
  const extension = fileExtension(fileName);
  return (
    looksLikePdf(bytes) ||
    looksLikeZip(bytes) ||
    extension === ".txt" ||
    mimeType.includes("text/") ||
    mimeType.includes("pdf") ||
    mimeType.includes("presentation") ||
    mimeType.includes("wordprocessing")
  );
}

function base64ToBytes(value: string) {
  const clean = value
    .replace(/^data:[^,]+,/, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/\s/g, "");
  const padded = clean.padEnd(Math.ceil(clean.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function looksLikeAudioBytes(bytes: Uint8Array) {
  const header = Array.from(bytes.slice(0, 16))
    .map((byte) => String.fromCharCode(byte))
    .join("");

  return (
    header.startsWith("OggS") ||
    header.startsWith("ID3") ||
    header.startsWith("RIFF") ||
    header.includes("ftyp") ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) ||
    (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3)
  );
}

async function decryptWhatsAppMedia(bytes: Uint8Array, mediaKey: string, info: string) {
  const mediaKeyBytes = base64ToBytes(mediaKey);
  const salt = new Uint8Array(32);
  const baseKey = await crypto.subtle.importKey("raw", mediaKeyBytes, "HKDF", false, ["deriveBits"]);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode(info),
    },
    baseKey,
    112 * 8,
  );
  const derived = new Uint8Array(derivedBits);
  const iv = derived.slice(0, 16);
  const cipherKey = derived.slice(16, 48);
  const encrypted = bytes.length > 10 ? bytes.slice(0, -10) : bytes;
  const cryptoKey = await crypto.subtle.importKey("raw", cipherKey, { name: "AES-CBC" }, false, ["decrypt"]);
  const decrypted = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv }, cryptoKey, encrypted));
  const padding = decrypted[decrypted.length - 1];

  if (padding > 0 && padding <= 16) {
    return decrypted.slice(0, -padding);
  }
  return decrypted;
}

async function decryptWhatsAppAudio(bytes: Uint8Array, mediaKey: string) {
  return await decryptWhatsAppMedia(bytes, mediaKey, "WhatsApp Audio Keys");
}

async function decryptWhatsAppDocument(bytes: Uint8Array, mediaKey: string) {
  return await decryptWhatsAppMedia(bytes, mediaKey, "WhatsApp Document Keys");
}

async function maybeDecryptWhatsAppAudio(file: AudioFile, audioInfo: NonNullable<ReturnType<typeof extractAudioInfo>>, diagnostics: string[]) {
  if (looksLikeAudioBytes(file.bytes)) return file;

  const mediaKey = firstText(audioInfo.audioMessage?.mediaKey, audioInfo.audioMessage?.MediaKey);
  if (!mediaKey) {
    diagnostics.push("decrypt:no-media-key");
    return file;
  }

  try {
    const decryptedBytes = await decryptWhatsAppAudio(file.bytes, mediaKey);
    diagnostics.push(`decrypt:ok:${asciiSignature(decryptedBytes)}:${byteSignature(decryptedBytes)}`);
    return {
      bytes: decryptedBytes,
      mimeType: audioInfo.mimeType || "audio/ogg",
      fileName: "whatsapp-audio.ogg",
    };
  } catch (error) {
    diagnostics.push(`decrypt:error:${error instanceof Error ? error.name : "unknown"}`);
    return file;
  }
}

async function maybeDecryptWhatsAppDocument(file: AudioFile, documentInfo: NonNullable<ReturnType<typeof extractDocumentInfo>>, diagnostics: string[]) {
  const mediaKey = firstText(documentInfo.documentMessage?.mediaKey, documentInfo.documentMessage?.MediaKey);
  if (!mediaKey || looksLikeDocumentBytes(file.bytes, file.fileName, file.mimeType)) return file;

  try {
    const decryptedBytes = await decryptWhatsAppDocument(file.bytes, mediaKey);
    diagnostics.push(`doc-decrypt:ok:${asciiSignature(decryptedBytes)}:${byteSignature(decryptedBytes)}`);
    return {
      bytes: decryptedBytes,
      mimeType: documentInfo.mimeType,
      fileName: documentInfo.fileName,
    };
  } catch (error) {
    diagnostics.push(`doc-decrypt:error:${error instanceof Error ? error.name : "unknown"}`);
    return file;
  }
}

async function audioFileFromMediaResponse(response: Response, mimeType: string, keyRow: any, diagnostics?: string[]) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json") || contentType.includes("text/")) {
    const payload = contentType.includes("application/json") ? await response.json().catch(() => null) : null;
    const base64 = extractBase64FromMediaResponse(payload);
    if (base64) return audioFileFromBase64(base64, mimeType);

    const mediaUrl = extractUrlFromMediaResponse(payload);
    if (mediaUrl) return await downloadAudioFromUrl(mediaUrl, keyRow, mimeType, diagnostics);

    const text = payload ? "" : await response.text().catch(() => "");
    const textBase64 = firstText(text);
    if (textBase64 && /^[A-Za-z0-9+/=\s]+$/.test(textBase64) && textBase64.length > 120) {
      return audioFileFromBase64(textBase64, mimeType);
    }
    console.error("Evolution retornou JSON de mídia sem arquivo reconhecido", {
      contentType,
      shape: jsonShape(payload),
    });
    diagnostics?.push(`json:${jsonShape(payload)}`);
    return null;
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) {
    diagnostics?.push(`binary-empty:${contentType || "no-type"}`);
    return null;
  }

  const ascii = bytesToAscii(bytes);
  if (ascii.startsWith("{")) {
    const payload = JSON.parse(ascii);
    const base64 = extractBase64FromMediaResponse(payload);
    if (base64) {
      diagnostics?.push("binary-json-base64");
      return audioFileFromBase64(base64, mimeType);
    }

    const mediaUrl = extractUrlFromMediaResponse(payload);
    if (mediaUrl) {
      diagnostics?.push("binary-json-url");
      return await downloadAudioFromUrl(mediaUrl, keyRow, mimeType, diagnostics);
    }

    diagnostics?.push(`binary-json:${jsonShape(payload)}`);
    return null;
  }

  if (looksLikeBase64(ascii)) {
    diagnostics?.push("binary-base64");
    return audioFileFromBase64(ascii, mimeType);
  }

  return {
    bytes,
    mimeType: contentType || mimeType,
    fileName: contentType.includes("mpeg") ? "whatsapp-audio.mp3" : "whatsapp-audio.ogg",
  };
}

async function mediaFileFromMediaResponse(
  response: Response,
  mimeType: string,
  fileName: string,
  keyRow: any,
  diagnostics?: string[],
): Promise<AudioFile | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json") || contentType.includes("text/")) {
    const payload = contentType.includes("application/json") ? await response.json().catch(() => null) : null;
    const base64 = extractBase64FromMediaResponse(payload);
    if (base64) return mediaFileFromBase64(base64, mimeType, fileName);

    const mediaUrl = extractUrlFromMediaResponse(payload);
    if (mediaUrl) return await downloadMediaFromUrl(mediaUrl, keyRow, mimeType, fileName, diagnostics);

    const text = payload ? "" : await response.text().catch(() => "");
    if (looksLikeBase64(text)) return mediaFileFromBase64(text, mimeType, fileName);

    diagnostics?.push(`doc-json:${jsonShape(payload)}`);
    return null;
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    mimeType: contentType || mimeType,
    fileName,
  };
}

function normalizeImportedText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ensureImportedText(text: string, message: string) {
  const normalized = normalizeImportedText(text);
  if (!normalized || normalized.length < 20) throw new Error(message);
  return normalized;
}

function decodeXmlText(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function extractPptxTextFromBytes(bytes: Uint8Array) {
  // @ts-ignore Remote import is resolved by Supabase Edge/Deno at deploy/runtime.
  const { default: JSZip } = await import("https://esm.sh/jszip@3.10.1");
  const zip = await JSZip.loadAsync(bytes);
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml/i)?.[1] ?? 0) - Number(b.match(/slide(\d+)\.xml/i)?.[1] ?? 0));
  const slides: string[] = [];

  for (const path of slidePaths) {
    const entry = zip.file(path);
    if (!entry) continue;
    const xml = await entry.async("text");
    const matches = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)).map((match) => decodeXmlText(match[1]).trim()).filter(Boolean);
    if (matches.length) slides.push(matches.join("\n"));
  }

  return ensureImportedText(slides.join("\n\n"), "Não encontrei texto editável no PPTX.");
}

async function extractDocxTextFromBytes(bytes: Uint8Array) {
  // @ts-ignore Remote import is resolved by Supabase Edge/Deno at deploy/runtime.
  const { default: JSZip } = await import("https://esm.sh/jszip@3.10.1");
  const zip = await JSZip.loadAsync(bytes);
  const documentXml = await zip.file("word/document.xml")?.async("text");
  if (!documentXml) throw new Error("Não encontrei o conteúdo principal do DOCX.");

  const paragraphs = Array.from(documentXml.matchAll(/<w:p[\s\S]*?<\/w:p>/g)).map((paragraph) => {
    return Array.from(paragraph[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g))
      .map((match) => decodeXmlText(match[1]))
      .join("");
  });

  return ensureImportedText(paragraphs.join("\n"), "Não encontrei texto editável no DOCX.");
}

function extractPdfTextFromBytes(bytes: Uint8Array) {
  const raw = new TextDecoder("latin1").decode(bytes);
  const pieces: string[] = [];
  const literalMatches = raw.matchAll(/\(([^()]|\\[()\\nrtbf]){1,500}\)\s*Tj/g);
  for (const match of literalMatches) {
    const text = match[0].replace(/\)\s*Tj$/, "").slice(1);
    pieces.push(text.replace(/\\n/g, "\n").replace(/\\r/g, "\n").replace(/\\t/g, " ").replace(/\\([()\\])/g, "$1"));
  }
  const arrayMatches = raw.matchAll(/\[([\s\S]{1,4000}?)\]\s*TJ/g);
  for (const match of arrayMatches) {
    const text = Array.from(match[1].matchAll(/\(([^()]|\\[()\\nrtbf]){1,500}\)/g))
      .map((item) => item[0].slice(1, -1))
      .join("");
    if (text) pieces.push(text);
  }

  return ensureImportedText(
    pieces.join("\n"),
    "O PDF parece escaneado ou comprimido de um jeito que o WhatsApp ainda não extrai. Envie um PDF com texto selecionável ou use a importação pela tela do Plano Estratégico.",
  );
}

async function extractDocumentText(file: AudioFile) {
  const extension = fileExtension(file.fileName);
  if (extension === ".txt" || file.mimeType.includes("text/")) {
    return ensureImportedText(new TextDecoder().decode(file.bytes), "O TXT está vazio.");
  }
  if (extension === ".pptx" || file.mimeType.includes("presentation")) return await extractPptxTextFromBytes(file.bytes);
  if (extension === ".docx" || file.mimeType.includes("wordprocessing")) return await extractDocxTextFromBytes(file.bytes);
  if (extension === ".pdf" || file.mimeType.includes("pdf") || looksLikePdf(file.bytes)) return extractPdfTextFromBytes(file.bytes);
  throw new Error("Formato não suportado pelo WhatsApp. Envie PDF, PPTX, DOCX ou TXT.");
}

async function downloadAudioFromEvolution(
  settings: any,
  keyRow: any,
  audioInfo: NonNullable<ReturnType<typeof extractAudioInfo>>,
  diagnostics: string[],
) {
  const baseUrl = String(settings?.instance_url ?? "").replace(/\/+$/, "");
  const instanceName = String(settings?.instance_name ?? "").trim();
  if (!baseUrl || !instanceName || !keyRow?.api_key) return null;

  const endpoints = [
    `${baseUrl}/message/downloadimage`,
    `${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`,
    `${baseUrl}/message/getBase64FromMediaMessage/${instanceName}`,
    `${baseUrl}/chat/getBase64FromMediaMessage`,
  ];

  const bodies = [
    {
      message: audioInfo.rawMessage,
    },
    {
      instance: instanceName,
      message: audioInfo.rawData,
      messageId: audioInfo.messageId || audioInfo.key.id,
      key: audioInfo.key,
      convertToMp4: false,
    },
    {
      message: {
        key: audioInfo.key,
        message: audioInfo.rawMessage,
      },
      convertToMp4: false,
    },
    {
      message: {
        key: audioInfo.key,
      },
      convertToMp4: false,
    },
    {
      messageId: audioInfo.messageId,
      key: audioInfo.key,
      convertToMp4: false,
    },
    {
      key: audioInfo.key,
      convertToMp4: false,
    },
    {
      remoteJid: audioInfo.key.remoteJid,
      messageId: audioInfo.messageId || audioInfo.key.id,
      id: audioInfo.messageId || audioInfo.key.id,
      fromMe: audioInfo.key.fromMe,
      convertToMp4: false,
    },
    {
      message: audioInfo.rawData,
      convertToMp4: false,
    },
    {
      instance: instanceName,
      message: audioInfo.rawMessage,
      convertToMp4: false,
    },
    {
      instanceName,
      message: audioInfo.rawMessage,
      key: audioInfo.key,
      convertToMp4: false,
    },
    {
      instance: instanceName,
      mediaKey: firstText(audioInfo.audioMessage?.mediaKey, audioInfo.audioMessage?.MediaKey),
      directPath: firstText(audioInfo.audioMessage?.directPath, audioInfo.audioMessage?.DirectPath),
      url: firstText(audioInfo.audioMessage?.url, audioInfo.audioMessage?.URL),
      mimetype: audioInfo.mimeType,
      type: "audio",
      convertToMp4: false,
    },
  ];

  for (const endpoint of endpoints) {
    for (const body of bodies) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: keyRow.api_key,
        },
        body: JSON.stringify(body),
      }).catch(() => null);

      if (!response?.ok) {
        if (response) {
          await response.body?.cancel().catch(() => undefined);
          console.error("Evolution não retornou mídia", {
            status: response.status,
            endpoint: endpoint.replace(baseUrl, ""),
            contentType: response.headers.get("content-type") ?? "",
          });
          diagnostics.push(`${endpoint.replace(baseUrl, "")}:${response.status}:${response.headers.get("content-type") ?? "no-type"}`);
        }
        continue;
      }
      const file = await audioFileFromMediaResponse(response, audioInfo.mimeType, keyRow, diagnostics);
      if (file) return file;
      console.error("Evolution retornou mídia sem base64 reconhecido", endpoint);
      diagnostics.push(`${endpoint.replace(baseUrl, "")}:ok-no-file`);
    }
  }

  return null;
}

async function downloadDocumentFromEvolution(
  settings: any,
  keyRow: any,
  documentInfo: NonNullable<ReturnType<typeof extractDocumentInfo>>,
  diagnostics: string[],
) {
  const baseUrl = String(settings?.instance_url ?? "").replace(/\/+$/, "");
  const instanceName = String(settings?.instance_name ?? "").trim();
  if (!baseUrl || !instanceName || !keyRow?.api_key) return null;

  const endpoints = [
    `${baseUrl}/message/downloadimage`,
    `${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`,
    `${baseUrl}/message/getBase64FromMediaMessage/${instanceName}`,
    `${baseUrl}/chat/getBase64FromMediaMessage`,
  ];

  const bodies = [
    { message: documentInfo.rawMessage },
    { instance: instanceName, message: documentInfo.rawData, messageId: documentInfo.messageId || documentInfo.key.id, key: documentInfo.key },
    { message: { key: documentInfo.key, message: documentInfo.rawMessage } },
    { message: { key: documentInfo.key } },
    { messageId: documentInfo.messageId, key: documentInfo.key },
    { key: documentInfo.key },
    { message: documentInfo.rawData },
    {
      instance: instanceName,
      mediaKey: firstText(documentInfo.documentMessage?.mediaKey, documentInfo.documentMessage?.MediaKey),
      directPath: firstText(documentInfo.documentMessage?.directPath, documentInfo.documentMessage?.DirectPath),
      url: firstText(documentInfo.documentMessage?.url, documentInfo.documentMessage?.URL),
      mimetype: documentInfo.mimeType,
      type: "document",
    },
  ];

  for (const endpoint of endpoints) {
    for (const body of bodies) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: keyRow.api_key,
        },
        body: JSON.stringify(body),
      }).catch(() => null);

      if (!response?.ok) {
        if (response) {
          await response.body?.cancel().catch(() => undefined);
          diagnostics.push(`doc:${endpoint.replace(baseUrl, "")}:${response.status}:${response.headers.get("content-type") ?? "no-type"}`);
        }
        continue;
      }

      const file = await mediaFileFromMediaResponse(response, documentInfo.mimeType, documentInfo.fileName, keyRow, diagnostics);
      if (file) return file;
      diagnostics.push(`doc:${endpoint.replace(baseUrl, "")}:ok-no-file`);
    }
  }

  return null;
}

async function resolveAudioFile(settings: any, keyRow: any, payload: any, diagnostics: string[]) {
  const audioInfo = extractAudioInfo(payload);
  if (!audioInfo) {
    diagnostics.push("no-audio-info");
    return null;
  }

  if (audioInfo.base64) {
    const file = audioFileFromBase64(audioInfo.base64, audioInfo.mimeType);
    if (file) return await maybeDecryptWhatsAppAudio(file, audioInfo, diagnostics);
  }

  if (audioInfo.url) {
    const file = await downloadAudioFromUrl(audioInfo.url, keyRow, audioInfo.mimeType, diagnostics, hostFromInstanceUrl(settings));
    if (file) return await maybeDecryptWhatsAppAudio(file, audioInfo, diagnostics);
  }

  const file = await downloadAudioFromEvolution(settings, keyRow, audioInfo, diagnostics);
  if (file) return await maybeDecryptWhatsAppAudio(file, audioInfo, diagnostics);
  return null;
}

async function resolveDocumentFile(settings: any, keyRow: any, payload: any, diagnostics: string[]) {
  const documentInfo = extractDocumentInfo(payload);
  if (!documentInfo) {
    diagnostics.push("no-document-info");
    return null;
  }

  let file: AudioFile | null = null;
  if (documentInfo.base64) file = mediaFileFromBase64(documentInfo.base64, documentInfo.mimeType, documentInfo.fileName);
  if (!file && documentInfo.url) file = await downloadMediaFromUrl(documentInfo.url, keyRow, documentInfo.mimeType, documentInfo.fileName, diagnostics, hostFromInstanceUrl(settings));
  if (!file) file = await downloadDocumentFromEvolution(settings, keyRow, documentInfo, diagnostics);

  if (!file) return null;
  return await maybeDecryptWhatsAppDocument(file, documentInfo, diagnostics);
}

async function transcribeIncomingAudio(
  client: ReturnType<typeof serviceClient>,
  orgId: string,
  userId: string,
  whatsappSettings: any,
  whatsappKeyRow: any,
  payload: any,
  diagnostics: string[],
) {
  const audioFile = await resolveAudioFile(whatsappSettings, whatsappKeyRow, payload, diagnostics);
  if (!audioFile) return "";
  const normalizedAudioFile = normalizeAudioFile(audioFile);
  diagnostics.push(
    `file:${audioFile.mimeType || "no-type"}>${normalizedAudioFile.mimeType}:${audioFile.bytes.length}:sig:${asciiSignature(audioFile.bytes)}:${byteSignature(audioFile.bytes)}`,
  );

  const { data: keyRow } = await client
    .from("ai_model_keys")
    .select("*")
    .eq("org_id", orgId)
    .eq("provider", "openai")
    .maybeSingle();

  if (!keyRow?.api_key) {
    throw new Error("Transcrição de áudio exige uma chave OpenAI cadastrada.");
  }

  try {
    await evaluateAiControls(client, orgId, { userId });
    const result = await transcribeAudioWithOpenAi(keyRow.api_key, audioFile);
    return result.text;
  } catch (error) {
    diagnostics.push(error instanceof Error ? error.message.slice(0, 120) : "openai:unknown");
    throw error;
  }
}

function extractInstanceName(payload: any) {
  return String(
    payload?.instance ??
      payload?.Instance ??
      payload?.instanceName ??
      payload?.InstanceName ??
      payload?.data?.instance ??
      payload?.Data?.Instance ??
      "",
  ).trim();
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBusinessOrOracleTopic(message: string) {
  const normalized = normalizeText(message);
  if (!normalized) return true;
  if (isOpeningMessage(message) || isConfirmationMessage(message)) return true;

  return /\b(oraculo|sistema|app|software|whatsapp|zap|empresa|negocio|gestao|administracao|estrategia|planejamento|plano|objetivo|meta|resultado|evolucao|indicador|kpi|okr|area|departamento|coordenador|time|equipe|lideranca|cliente|venda|comercial|marketing|financeiro|faturamento|lucro|margem|custo|caixa|orcamento|producao|operacao|processo|estoque|compra|fornecedor|mercado|concorrencia|risco|prioridade|execucao|evidencia|acao|trimestre|mensal|anual|reuniao|projeto|produto|servico|contrato|prazo|entrega|performance|produtividade)\b/.test(normalized);
}

function isClearlyGeneralTopic(message: string) {
  const normalized = normalizeText(message);
  if (!normalized || isBusinessOrOracleTopic(message)) return false;

  return /\b(guerra|ucrania|russia|israel|palestina|politica|presidente|eleicao|copa|copa do mundo|world cup|futebol|jogo|campeonato|olimpiada|filme|serie|novela|musica|celebridade|fofoca|receita|culinaria|viagem|turismo|previsao do tempo|horoscopo|astrologia|historia geral|geografia|matematica|fisica|quimica|biologia|poema|piada aleatoria|noticias)\b/.test(normalized);
}

type OutOfScopeKind =
  | "sensitive_geopolitics"
  | "sports"
  | "politics"
  | "entertainment"
  | "cooking"
  | "travel_weather"
  | "general";

type OutOfScopeCategory = {
  kind: OutOfScopeKind;
  label: string;
  test: RegExp;
  humorHooks: string[];
};

const OUT_OF_SCOPE_CATEGORIES: OutOfScopeCategory[] = [
  {
    kind: "sensitive_geopolitics",
    label: "geopolítica",
    test: /(ucrania|russia|guerra|israel|palestina)/,
    humorHooks: ["mapa-mundi fora da mesa", "comentarista internacional de plantão", "radar de risco da empresa"],
  },
  {
    kind: "sports",
    label: "esporte",
    test: /(copa|world cup|futebol|jogo|campeonato|olimpiada)/,
    humorHooks: ["placar", "escalação", "banco de reservas", "bola no campo da execução", "camisa 10 das prioridades"],
  },
  {
    kind: "politics",
    label: "política",
    test: /(politica|presidente|eleicao)/,
    humorHooks: ["urna", "palanque", "debate", "promessa de campanha", "voto vencido pelo plano"],
  },
  {
    kind: "entertainment",
    label: "entretenimento",
    test: /(filme|serie|novela|musica|celebridade|fofoca)/,
    humorHooks: ["roteiro", "temporada", "elenco", "crítico de série", "próximo episódio da execução"],
  },
  {
    kind: "cooking",
    label: "culinária",
    test: /(receita|culinaria)/,
    humorHooks: ["receita", "ingredientes", "forno", "tempero", "ponto do plano"],
  },
  {
    kind: "travel_weather",
    label: "clima ou viagem",
    test: /(previsao do tempo|viagem|turismo)/,
    humorHooks: ["previsão", "rota", "embarque", "cartão de embarque", "clima do trimestre"],
  },
];

function humanList(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} e ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

function detectedOutOfScopeCategories(message: string) {
  const normalized = normalizeText(message);
  const detected = OUT_OF_SCOPE_CATEGORIES.filter((category) => category.test.test(normalized));
  return detected.length ? detected : [{ kind: "general" as const, label: "curiosidade geral", test: /.*/, humorHooks: ["atalho fora da rota", "mesa do Oráculo", "radar da execução"] }];
}

function outOfScopeTopicLabel(message: string) {
  const labels = detectedOutOfScopeCategories(message).map((category) => category.label);
  return labels.length === 1 ? labels[0] : humanList(labels);
}

function outOfScopeKind(message: string) {
  return detectedOutOfScopeCategories(message)[0]?.kind ?? "general";
}

function outOfScopeHumorGuide(message: string) {
  const categories = detectedOutOfScopeCategories(message);
  const hooks = humanList(categories.flatMap((category) => category.humorHooks).slice(0, 8));
  const hasSensitiveTopic = categories.some((category) => category.kind === "sensitive_geopolitics");
  const sensitivityRule = hasSensitiveTopic
    ? "Como ha tema sensivel, nao faca piada sobre guerra, vitimas ou sofrimento. A leveza pode ser apenas sobre o Oraculo nao virar comentarista internacional e sobre trazer o tema para risco/cenario da empresa."
    : `Crie uma piadinha curta usando uma dessas imagens, sem copiar literalmente: ${hooks}.`;

  return [
    `Assuntos detectados: ${outOfScopeTopicLabel(message)}.`,
    "Use somente os assuntos detectados; nao misture Copa, guerra, fofoca, receita, politica ou clima se a pessoa nao citou isso na mensagem atual.",
    sensitivityRule,
    "Boa direcao de estilo: leve como 'se eu for por esse caminho, daqui a pouco estou escalando o time do trimestre', mas crie uma versao nova ligada ao assunto atual.",
  ].join(" ");
}

function textSimilarity(a: string, b: string) {
  const wordsA = new Set(normalizeText(a).split(" ").filter((word) => word.length > 4));
  const wordsB = new Set(normalizeText(b).split(" ").filter((word) => word.length > 4));
  if (!wordsA.size || !wordsB.size) return 0;

  let overlap = 0;
  wordsA.forEach((word) => {
    if (wordsB.has(word)) overlap += 1;
  });

  return overlap / Math.min(wordsA.size, wordsB.size);
}

function recentOracleRepliesToAvoid(history: ConversationHistory) {
  return history.messages
    .filter((historyMessage) => historyMessage.author === "oracle")
    .slice(-4)
    .map((historyMessage) => historyMessage.text.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function answerIsTooSimilarToRecent(answer: string, history: ConversationHistory) {
  return recentOracleRepliesToAvoid(history).some((previous) => normalizeText(previous) === normalizeText(answer) || textSimilarity(previous, answer) > 0.72);
}

function answerMentionsUndetectedTopic(answer: string, message: string) {
  const detectedKinds = new Set(detectedOutOfScopeCategories(message).map((category) => category.kind));
  const normalizedAnswer = normalizeText(answer);
  const contamination: Record<Exclude<OutOfScopeKind, "general">, RegExp> = {
    sensitive_geopolitics: /\b(guerra|ucrania|russia|israel|palestina|mapa mundi|geopolitica)\b/,
    sports: /\b(copa|futebol|placar|atacante|bola|camisa 10|campeonato|olimpiada)\b/,
    politics: /\b(politica|urna|palanque|eleicao|presidente|campanha)\b/,
    entertainment: /\b(fofoca|celebridade|novela|serie|filme|roteiro|temporada)\b/,
    cooking: /\b(receita|fogao|forno|cozinha|tempero|culinaria)\b/,
    travel_weather: /\b(previsao do tempo|clima|viagem|turismo|embarque|cartao de embarque)\b/,
  };

  return (Object.entries(contamination) as [Exclude<OutOfScopeKind, "general">, RegExp][])
    .some(([kind, pattern]) => !detectedKinds.has(kind) && pattern.test(normalizedAnswer));
}

function fallbackOutOfScopeReply(profile: any, message: string, history?: ConversationHistory) {
  const topic = outOfScopeTopicLabel(message);
  const common = "Quer trazer isso para planejamento, metas ou alguma área da empresa?";
  const optionsByKind: Record<string, string[][]> = {
    sensitive_geopolitics: [
      [
        `${firstName(profile)}, ${topic} é sério demais para virar palpite rápido no WhatsApp do Oráculo.`,
        "Se for risco para fornecedores, custos ou cenário da empresa, aí eu entro bem.",
        "Quer olhar por esse ângulo estratégico?",
      ],
      [
        `${localGreeting()}, ${firstName(profile)}. Eu não vou virar comentarista de mapa no WhatsApp do Oráculo.`,
        "Mas posso ajudar a traduzir cenário externo em risco, plano e decisão para a empresa.",
        "Esse era o caminho que você queria seguir?",
      ],
    ],
    sports: [
      [
        `${firstName(profile)}, ${topic} eu deixo para a mesa esportiva.`,
        "Aqui eu jogo melhor montando escalação de prioridades, metas e próximos passos.",
        common,
      ],
      [
        `${localGreeting()}, ${firstName(profile)}. Se eu entrar no futebol, daqui a pouco estou chamando objetivo trimestral de atacante.`,
        "Vamos deixar a bola com o Oráculo no campo da execução.",
        "Qual plano ou área você quer revisar?",
      ],
    ],
    politics: [
      [
        `${firstName(profile)}, esse assunto político eu vou deixar fora da urna do Oráculo.`,
        "Por aqui eu ajudo melhor com decisões da empresa, metas e responsabilidades claras.",
        common,
      ],
      [
        `${localGreeting()}, ${firstName(profile)}. Se eu subir nesse palanque, o plano fica sem dono.`,
        "Vamos voltar para estratégia, execução e evidências.",
        "Quer revisar algum objetivo?",
      ],
    ],
    entertainment: [
      [
        `${firstName(profile)}, entretenimento eu deixo para depois do expediente.`,
        "Se eu virar crítico de série, a execução ganha temporada demais e entrega de menos.",
        "Quer organizar o próximo passo do plano?",
      ],
      [
        `${localGreeting()}, ${firstName(profile)}. Esse roteiro não é do Oráculo.`,
        "O meu papel é ajudar a escrever o próximo capítulo da empresa.",
        "Vamos olhar metas, áreas ou execução?",
      ],
    ],
    cooking: [
      [
        `${firstName(profile)}, receita de cozinha eu vou deixar fora do painel.`,
        "Mas se for a receita do trimestre, aí eu ajudo a acertar ingredientes, prazo e responsável.",
        "Quer montar esse plano?",
      ],
      [
        `${localGreeting()}, ${firstName(profile)}. Se eu for para o fogão, daqui a pouco coloco KPI no forno.`,
        "Melhor eu ficar na gestão: meta, ação e evidência.",
        "Qual objetivo precisa andar?",
      ],
    ],
    travel_weather: [
      [
        `${firstName(profile)}, previsão e roteiro de viagem não são meu melhor painel.`,
        "A previsão que eu consigo fazer bem aqui é de prazo, risco e prioridade.",
        "Quer olhar algum plano nessa linha?",
      ],
      [
        `${localGreeting()}, ${firstName(profile)}. Eu não emito cartão de embarque, mas ajudo a traçar rota de execução.`,
        "Vamos voltar para metas, responsáveis e próximos passos.",
        "Qual área quer revisar?",
      ],
    ],
    general: [
      [
        `${localGreeting()}, ${firstName(profile)}. ${topic} ficou um pouco fora da mesa do Oráculo.`,
        "Eu rendo melhor em negócio, gestão, estratégia e execução.",
        common,
      ],
    ],
  };
  const options = optionsByKind[outOfScopeKind(message)] ?? optionsByKind.general;
  const seedSource = `${normalizeText(message)} ${new Date().toISOString().slice(0, 16)}`;
  const startIndex = Math.abs([...seedSource].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % options.length;
  const orderedOptions = options.map((_, index) => options[(startIndex + index) % options.length]);
  const recentReplies = history ? recentOracleRepliesToAvoid(history) : [];
  const selected = orderedOptions.find((option) => {
    const candidate = option.join("\n");
    return !recentReplies.some((previous) => textSimilarity(previous, candidate) > 0.72);
  }) ?? orderedOptions[0];
  return selected.join("\n");
}

async function buildOutOfScopeReply(
  client: ReturnType<typeof serviceClient>,
  orgId: string,
  profile: any,
  conversation: ConversationRecord,
  message: string,
) {
  const aiRoute = await resolveAiFunction(client, orgId, "daily");
  if (!aiRoute) return fallbackOutOfScopeReply(profile, message);

  const [history, orgTone] = await Promise.all([
    loadConversationHistory(client, conversation.id, 12),
    loadOrgTone(client, orgId),
  ]);
  const topic = outOfScopeTopicLabel(message);
  const humorGuide = outOfScopeHumorGuide(message);
  const recentReplies = recentOracleRepliesToAvoid(history);
  const systemPrompt = [
    PERSONA_ORACULO,
    toneDirective(orgTone),
    "A mensagem mais recente do usuário está fora do escopo do Oráculo.",
    `Mensagem atual: ${message}`,
    `Assunto detectado: ${topic}`,
    "Escopo do Oráculo: negócio, gestão, administração, estratégia, planejamento, objetivos, áreas, execução, evidências e funcionamento do próprio Oráculo.",
    "Tarefa: responda de modo contextual e natural, em português do Brasil, sem parecer resposta padrão. O usuário gosta de leveza parecida com o exemplo de escalar o time do trimestre, mas a piada precisa mudar conforme o assunto atual.",
    `Guia de leveza contextual: ${humorGuide}`,
    "Regras obrigatórias:",
    "- Reconheça o assunto específico que a pessoa trouxe.",
    "- NÃO responda o conteúdo factual externo. Não explique o assunto; só reconheça e redirecione.",
    "- Não cite assunto que a pessoa não citou agora. Se ela falou receita, não mencione Copa; se falou Copa, não mencione guerra ou fofoca; se falou guerra, não mencione esporte.",
    "- Use no máximo 3 frases curtas.",
    "- Quando o tema não for sensível, inclua uma leveza ou piadinha curta que nasça do assunto citado. Não use piada genérica.",
    "- Em tema sensível, não faça piada do sofrimento; use apenas leveza sobre o Oráculo não ser o canal certo.",
    "- Conduza de volta com uma pergunta prática sobre planejamento, objetivo, área, execução ou gestão.",
    "- Não repita literalmente respostas anteriores do histórico.",
    "- Não comece sempre do mesmo jeito e não use a frase 'esse não é o objetivo do Oráculo' de forma crua.",
    recentReplies.length ? `Frases recentes do Oráculo que NÃO podem ser repetidas nem parafraseadas de perto:\n${recentReplies.map((reply) => `- ${reply.slice(0, 280)}`).join("\n")}` : "",
    formatConversationMemory(history),
  ].filter(Boolean).join("\n\n");

  try {
    const result = await callModelForFunction(
      client,
      orgId,
      "daily",
      aiRoute,
      systemPrompt,
      conversationMessagesForModel(history),
      { ...aiRoute.limits, maxTokens: Math.min(aiRoute.limits.maxTokens, 320), temperature: 0.8 },
      { userId: profile?.id ?? null },
    );
    await recordAiUsage({
      client,
      orgId,
      provider: aiRoute.provider,
      model: aiRoute.model,
      channel: "whatsapp",
      usage: result.usage,
      settings: aiRoute.legacySettings,
      metadata: { aiFunction: "daily", action: "out_of_scope_redirect", phone: profile?.phone ?? null, conversationId: conversation.id },
    });
    const answer = result.text.trim();
    if (!answer || answer.length > 900) return fallbackOutOfScopeReply(profile, message, history);
    if (answerIsTooSimilarToRecent(answer, history) || answerMentionsUndetectedTopic(answer, message)) {
      return fallbackOutOfScopeReply(profile, message, history);
    }
    return answer;
  } catch (error) {
    console.error("Erro ao gerar resposta fora de escopo", error instanceof Error ? error.message : String(error));
    if (isAiControlLimitError(error)) return error.message;
    return fallbackOutOfScopeReply(profile, message, history);
  }
}

function firstName(profile: any) {
  return String(profile?.full_name ?? "").trim().split(/\s+/)[0] || "Gui";
}

function localGreeting() {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      hour12: false,
      timeZone: "America/Sao_Paulo",
    }).format(new Date()),
  );

  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function localTimestamp() {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

function isOpeningMessage(message: string) {
  const normalized = normalizeText(message);
  if (!normalized) return true;

  const openingOnly = new Set([
    "oi",
    "ola",
    "alo",
    "bom dia",
    "boa tarde",
    "boa noite",
    "tudo bem",
    "e ai",
    "teste",
    "testando",
  ]);

  if (openingOnly.has(normalized)) return true;
  if (normalized.length > 42) return false;

  return /^(oi|ola|alo|bom dia|boa tarde|boa noite|e ai|teste)\b/.test(normalized) &&
    !/(plano|objetivo|meta|resultado|evolucao|evidencia|status|como esta|revis|criar|registrar|trimestral|mensal)/.test(normalized);
}

function openingAnswer(profile: any, organization: any) {
  const orgName = [organization?.name, organization?.subtitle].filter(Boolean).join(" / ") || "sua empresa";
  return `${localGreeting()}, ${firstName(profile)}. Sou o Oráculo da ${orgName}. O que você deseja fazer agora? Posso revisar Resultado, Evolução, planos trimestrais ou registrar uma evidência.`;
}

function objectiveStats(objectives: any[]) {
  return {
    total: objectives.length,
    onTrack: objectives.filter((objective) => objective.status === "on_track").length,
    atRisk: objectives.filter((objective) => objective.status === "at_risk").length,
    late: objectives.filter((objective) => objective.status === "late").length,
  };
}

function contextualFallback(profile: any, organization: any, objectives: any[], message: string) {
  const greeting = `${localGreeting()}, ${firstName(profile)}.`;
  const normalized = normalizeText(message);
  const stats = objectiveStats(objectives);
  const risk = objectives.filter((objective) => ["late", "at_risk"].includes(objective.status));
  const firstRisk = risk.sort((a, b) => (a.status === "late" ? -1 : 1) - (b.status === "late" ? -1 : 1))[0];
  const asksSystemOperation = /(sistema|oraculo|whatsapp|zap|app|software|plataforma|funcionando|rodando)/.test(normalized);
  const asksPlanStatus = /(plano|objetivo|meta|resultado|evolucao|estrateg|trimestral|mensal|indicador|empresa|negocio|gaam)/.test(normalized);

  if (!objectives.length) {
    return `${greeting} Ainda não encontrei objetivos no Oráculo da ${organization?.name ?? "empresa"}. Quer começar pelo Plano Estratégico anual ou por um plano trimestral?`;
  }

  if (asksSystemOperation && !asksPlanStatus) {
    return `${greeting} Por aqui eu recebi sua mensagem. Você quer saber se o Oráculo/WhatsApp está funcionando ou quer um resumo dos planos da empresa?`;
  }

  if (/(evidencia|prova|comprov|registr)/.test(normalized)) {
    return `${greeting} Me diga qual objetivo recebeu a evidência e qual fato comprova o avanço. Exemplo: "Evidência para Validar 2 protótipos: laudo A aprovado hoje".`;
  }

  if (/(status|resumo|revis|como esta|andamento|situacao)/.test(normalized)) {
    const attention = firstRisk ? ` O ponto de maior atenção é "${firstRisk.title}" (${firstRisk.status === "late" ? "atrasado" : "em risco"}).` : "";
    return `${greeting} Hoje vejo ${stats.total} objetivos: ${stats.onTrack} no prazo, ${stats.atRisk} em risco e ${stats.late} atrasado.${attention} Quer revisar esse ponto ou registrar uma evidência?`;
  }

  if (firstRisk) {
    return `${greeting} Pelo contexto do plano, eu começaria por "${firstRisk.title}". Qual evidência concreta prova avanço nesse objetivo desde a última revisão?`;
  }

  return `${greeting} O plano não tem ponto crítico aparente agora. Você quer revisar Resultado, Evolução, planos trimestrais ou registrar uma evidência?`;
}

const WHATSAPP_DAILY_FORM_RULES = [
  "Você está no WhatsApp. Regras de forma:",
  "- Converse como gente: caloroso, direto, zero robótico. Chame pelo primeiro nome quando natural.",
  "- Escopo: fale sobre Oráculo, negócio, gestão, administração, estratégia, planejamento, objetivos, áreas, execução, evidências e temas claramente conectados à empresa.",
  "- Se a pessoa pedir curiosidade geral fora desse escopo, reconheça somente o assunto que ela citou, use uma leveza curta ligada a esse assunto e puxe de volta para planejamento/gestão. Não dê a resposta factual externa e não misture exemplos de outros temas.",
  "- Em papo leve ou pergunta simples, responda curto (1 a 3 frases).",
  "- Não comece toda resposta com 'Entendi' e não repita mecanicamente o que a pessoa acabou de dizer.",
  "- Quando a pessoa compartilhar um sucesso ou uma dificuldade, reconheça o fato com naturalidade antes de perguntar sobre registro, evidência ou próximo passo.",
  "- Não transforme conversa casual em formulário. Menus e listas só entram quando resolvem uma escolha ou ambiguidade real.",
  "- Quando apresentar status, plano ou lista, ESTRUTURE: *títulos em negrito*, itens com hífen, uma informação por linha. Nada de parágrafo corrido com números misturados.",
  "- Resposta longa: divida em blocos separados por uma linha contendo apenas --- (no máximo 3 blocos). Cada bloco deve fazer sentido sozinho.",
  "- Sempre feche apontando o próximo passo ou com UMA pergunta que ajude a decidir.",
  "- Não despeje diagnóstico completo sem a pessoa pedir. Se a pergunta for ambígua, pergunte antes.",
  "- Nunca diga que salvou algo sem confirmação do sistema.",
].join("\n");

async function sendFormattedWhatsApp(settings: any, keyRow: any, phone: string, text: string) {
  await sendWhatsAppMessages(settings, keyRow, phone, formatForWhatsApp(text));
}

async function buildAnswer(
  client: ReturnType<typeof serviceClient>,
  orgId: string,
  areaId: string | null,
  message: string,
  profile: any,
  membership: any,
  conversation: ConversationRecord,
  interactionInstruction = "",
) {
  const aiRoute = await resolveAiFunction(client, orgId, "daily");
  const [
    { data: organization },
    { data: objectives },
    { data: areas },
    history,
    planContext,
    orgTone,
  ] =
    await Promise.all([
      client.from("organizations").select("name, subtitle").eq("id", orgId).maybeSingle(),
      client.from("objectives").select("*").eq("org_id", orgId).is("archived_at", null).order("created_at"),
      client.from("areas").select("*").eq("org_id", orgId).is("archived_at", null).order("created_at"),
      loadConversationHistory(client, conversation.id),
      buildPlanContext(client, orgId, { areaId, focus: areaId ? (/(mes|mês|mensal|acao|ação|acoes|ações)/i.test(message) ? "monthly" : "area") : "org" }),
      loadOrgTone(client, orgId),
    ]);

  const currentArea = (areas ?? []).find((area: any) => area.id === areaId) ?? null;
  const activeAreaIds = new Set((areas ?? []).map((area: any) => area.id));
  const activeObjectives = (objectives ?? []).filter((objective: any) =>
    !objective.area_id || activeAreaIds.has(objective.area_id)
  );

  if (!aiRoute) {
    return isOpeningMessage(message) ? openingAnswer(profile, organization) : contextualFallback(profile, organization, activeObjectives, message);
  }

  const systemPrompt = [
    PERSONA_ORACULO,
    toneDirective(orgTone),
    WHATSAPP_DAILY_FORM_RULES,
    "Dados do atendimento:",
    `- O contato atual é ${profile?.full_name ?? "usuário sem nome"} (${membership?.role ?? "sem papel"}).`,
    `- Área vinculada ao contato: ${currentArea?.name ?? "sem área específica"}.`,
    `- Horário local do atendimento: ${localTimestamp()}.`,
    "Se a pessoa perguntar se o sistema está funcionando, responda que recebeu a mensagem e pergunte se ela quer falar do funcionamento do Oráculo/WhatsApp ou do andamento dos planos.",
    "Se citar status do plano, objetivos, metas ou indicadores, cite itens concretos do contexto. Se pedir evidência, diga qual evidência falta.",
    conversation.previous_conversation_id
      ? "Este é um novo episódio após inatividade. Use a memória apenas como contexto; não retome pergunta, formulário ou sessão anterior sem pedido explícito da pessoa. Em saudação simples, cumprimente naturalmente e pergunte o que ela quer fazer agora."
      : "",
    interactionInstruction,
    formatConversationMemory(history),
    "Contexto atual do plano:",
    planContext,
  ].filter(Boolean).join("\n\n");

  try {
    const result = await callModelForFunction(
      client,
      orgId,
      "daily",
      aiRoute,
      systemPrompt,
      conversationMessagesForModel(history),
      aiRoute.limits,
      { userId: profile?.id ?? null },
    );
    await recordAiUsage({
      client,
      orgId,
      provider: aiRoute.provider,
      model: aiRoute.model,
      channel: "whatsapp",
      usage: result.usage,
      settings: aiRoute.legacySettings,
      metadata: { areaId, phone: profile?.phone ?? null, conversationId: conversation.id, aiFunction: "daily" },
    });
    return result.text;
  } catch (_error) {
    console.error("Erro ao chamar IA no WhatsApp", _error instanceof Error ? _error.message : String(_error));
    if (isAiControlLimitError(_error)) return _error.message;
    return contextualFallback(profile, organization, objectives ?? [], message);
  }
}

function pendingConversationContext(conversation: ConversationRecord) {
  const context = conversation.pending_context;
  if (!context || typeof context !== "object") return null;
  const expiresAt = String(context.expiresAt ?? "");
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return null;
  return context;
}

function isRejectionMessage(value: string) {
  return /^(nao|não|agora nao|agora não|deixa|dispenso|prefiro nao|prefiro não|só compartilhar|so compartilhar)[.!\s]*$/i.test(value.trim());
}

type DocumentTarget = "strategic" | "quarterly" | "monthly" | "evidence" | "unknown";

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (_error) {
    return null;
  }
}

function classifyDocumentFallback(text: string): { target: DocumentTarget; confidence: number; reason: string } {
  const normalized = normalizeText(text);
  if (/swot|missao|visao|valores|proposito|tema do ano|objetivos estrategicos|planejamento estrategico/.test(normalized)) {
    return { target: "strategic", confidence: 0.72, reason: "Contém sinais de planejamento estratégico anual." };
  }
  if (/trimestral|q1|q2|q3|q4|trimestre|entregas do trimestre|objetivo anual da area/.test(normalized)) {
    return { target: "quarterly", confidence: 0.68, reason: "Contém sinais de plano trimestral." };
  }
  if (/mensal|mes|semana|acao-chave|acoes-chave|checklist|ate dia/.test(normalized)) {
    return { target: "monthly", confidence: 0.66, reason: "Contém sinais de plano mensal ou execução do mês." };
  }
  if (/evidencia|comprovante|relatorio|foto|laudo|contrato assinado|nota fiscal/.test(normalized)) {
    return { target: "evidence", confidence: 0.62, reason: "Parece comprovação ou evidência de avanço." };
  }
  return { target: "unknown", confidence: 0.35, reason: "Não encontrei sinais suficientes para classificar com segurança." };
}

function targetLabel(target: DocumentTarget) {
  const labels: Record<DocumentTarget, string> = {
    strategic: "Plano Estratégico",
    quarterly: "Planos Trimestrais",
    monthly: "Plano Mensal",
    evidence: "Evidência",
    unknown: "classificação indefinida",
  };
  return labels[target];
}

function targetRoute(target: DocumentTarget) {
  const routes: Record<DocumentTarget, string> = {
    strategic: "/estrategico",
    quarterly: "/planos-trimestrais",
    monthly: "/execucao",
    evidence: "/",
    unknown: "/configuracoes",
  };
  return routes[target];
}

type PlanDocumentType = "strategic" | "quarterly" | "monthly" | "month_close" | "quarter_close";

function inferDocumentType(message: string, planningType: "strategic" | "quarterly" | "monthly" | null): PlanDocumentType {
  const normalized = normalizeText(message);
  const asksClose = /\b(fechamento|fechar|check in|checkin|balanco|revisao)\b/.test(normalized);
  if (asksClose && /\b(tri|trimestre|trimestral|q[1-4]|t[1-4])\b/.test(normalized)) return "quarter_close";
  if (asksClose) return "month_close";
  if (planningType === "strategic" || /\b(estrategico|estrategia|anual|ano)\b/.test(normalized)) return "strategic";
  if (planningType === "quarterly" || /\b(tri|trimestre|trimestral|q[1-4]|t[1-4])\b/.test(normalized)) return "quarterly";
  if (planningType === "monthly" || /\b(mes|mensal|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|abr|mai|jun|jul|ago|set|out|nov|dez)\b/.test(normalized)) return "monthly";
  return "monthly";
}

function periodForDocument(type: PlanDocumentType, hint: string | null | undefined, message: string) {
  if (type === "strategic") return periodForPlanning("strategic", hint, message);
  if (type === "quarterly") return periodForPlanning("quarterly", hint, message);
  if (type === "monthly") return periodForPlanning("monthly", hint, message);
  if (type === "quarter_close") return periodForClose("quarterly", hint, message);
  return periodForClose("monthly", hint, message);
}

async function resolveDocumentAreaId(client: ReturnType<typeof serviceClient>, orgId: string, message: string, currentAreaId: string | null) {
  const normalized = normalizeText(message);
  const { data: areas, error } = await client
    .from("areas")
    .select("id, name")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("created_at");
  if (error) throw error;
  const match = (areas ?? []).find((area: any) => {
    const name = normalizeText(String(area.name ?? ""));
    return name && normalized.includes(name);
  });
  return match?.id ?? currentAreaId;
}

async function latestDocumentByQuery(client: ReturnType<typeof serviceClient>, orgId: string, type: PlanDocumentType, areaId: string | null, period: string | null) {
  let query = client.from("plan_documents").select("*").eq("org_id", orgId).eq("type", type).is("archived_at", null).order("created_at", { ascending: false }).limit(1);
  if (areaId) query = query.eq("area_id", areaId);
  if (period) query = query.eq("period", period);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function answerDocumentQuestion(
  client: ReturnType<typeof serviceClient>,
  params: {
    orgId: string;
    areaId: string | null;
    message: string;
    planningType: "strategic" | "quarterly" | "monthly" | null;
    periodHint: string | null;
  },
) {
  const type = inferDocumentType(params.message, params.planningType);
  const period = periodForDocument(type, params.periodHint, params.message);
  const areaId = type === "strategic" ? null : await resolveDocumentAreaId(client, params.orgId, params.message, params.areaId);

  const document =
    await latestDocumentByQuery(client, params.orgId, type, areaId, period) ??
    await latestDocumentByQuery(client, params.orgId, type, areaId, null) ??
    await latestDocumentByQuery(client, params.orgId, type, null, null);

  if (!document) {
    const typeText = targetLabel(type === "strategic" ? "strategic" : type === "quarterly" || type === "quarter_close" ? "quarterly" : "monthly");
    return `Ainda não encontrei um documento padrão de ${typeText} salvo no Oráculo. Posso te conduzir para criar esse plano agora, ou você pode importar um arquivo e confirmar a proposta.`;
  }

  const rendered = renderPlanForWhatsApp(document.content ?? {});
  const versionLine = `Documento: ${document.title} · v${document.version}`;
  return `${versionLine}\n\n${rendered}`;
}

async function classifyImportedDocument(
  client: ReturnType<typeof serviceClient>,
  orgId: string,
  areaId: string | null,
  fileName: string,
  extractedText: string,
  profile: any,
) {
  const aiRoute = await resolveAiFunction(client, orgId, "background");
  const [{ data: areas }, { data: strategicPlan }, { data: areaPlans }, { data: objectives }] =
    await Promise.all([
      client.from("areas").select("id, name").eq("org_id", orgId).is("archived_at", null).order("created_at"),
      client.from("strategic_plans").select("year").eq("org_id", orgId).order("year", { ascending: false }).limit(1).maybeSingle(),
      client.from("area_plans").select("area_id, year").eq("org_id", orgId),
      client.from("objectives").select("title, level, area_id, period").eq("org_id", orgId).is("archived_at", null).order("created_at"),
    ]);

  const activeAreaIds = new Set((areas ?? []).map((area: any) => area.id));
  const activeAreaPlans = (areaPlans ?? []).filter((plan: any) => activeAreaIds.has(plan.area_id));
  const activeObjectives = (objectives ?? []).filter((objective: any) =>
    !objective.area_id || activeAreaIds.has(objective.area_id)
  );
  const areaNames = new Map((areas ?? []).map((area: any) => [area.id, area.name]));
  const classifierContext = {
    areas: (areas ?? []).map((area: any) => area.name),
    latestStrategicPlanYear: strategicPlan?.year ?? null,
    areaPlans: activeAreaPlans.map((plan: any) => ({ area: areaNames.get(plan.area_id) ?? null, year: plan.year })),
    objectives: activeObjectives.slice(0, 80).map((objective: any) => ({
      title: String(objective.title ?? "").slice(0, 240),
      level: objective.level,
      area: objective.area_id ? areaNames.get(objective.area_id) ?? null : "Empresa",
      period: objective.period,
    })),
    currentArea: areaId ? areaNames.get(areaId) ?? null : null,
  };

  if (!aiRoute) return classifyDocumentFallback(extractedText);

  const systemPrompt = [
    "Você classifica documentos enviados por WhatsApp para o sistema Oráculo.",
    UNTRUSTED_CONTENT_RULES,
    "Responda somente JSON válido, sem markdown.",
    "Targets possíveis: strategic, quarterly, monthly, evidence, unknown.",
    "Use strategic para planejamento anual da empresa, SWOT, propósito, visão, temas do ano, objetivos estratégicos e projetos prioritários.",
    "Use quarterly para plano de área/departamento, objetivos trimestrais, Q1/Q2/Q3/Q4, entregas trimestrais ou desdobramento do anual.",
    "Use monthly para objetivos do mês, ações-chave, execução mensal, prazos dentro do mês ou check-in mensal.",
    "Use evidence para comprovantes de avanço: laudo, contrato, relatório, foto descrita, medição, nota, resultado entregue.",
    "Se não houver segurança, use unknown.",
    "Formato obrigatório: {\"target\":\"strategic|quarterly|monthly|evidence|unknown\",\"confidence\":0.0,\"reason\":\"curto\",\"areaName\":\"ou null\",\"period\":\"ou null\",\"nextQuestion\":\"uma pergunta curta\"}",
    "Contexto mínimo confiável do Oráculo:",
    JSON.stringify(classifierContext, null, 2),
  ].join("\n\n");

  const result = await callModelForFunction(
    client,
    orgId,
    "background",
    aiRoute,
    systemPrompt,
    [
      {
        role: "user",
        content: formatUntrustedDocument({ content: extractedText, fileName }),
      },
    ],
    aiRoute.limits,
    { userId: profile?.id ?? null },
  );

  await recordAiUsage({
    client,
    orgId,
    provider: aiRoute.provider,
    model: aiRoute.model,
    channel: "whatsapp",
    usage: result.usage,
    settings: aiRoute.legacySettings,
    metadata: { areaId, fileName, action: "document_classification", aiFunction: "background" },
  });

  const parsed = parseJsonObject(result.text) as any;
  assertSafeStructuredValue(parsed, { maxDepth: 4, maxNodes: 40, maxArrayLength: 10, maxStringLength: 1_000, maxTotalStringChars: 3_000 });
  const target = ["strategic", "quarterly", "monthly", "evidence", "unknown"].includes(parsed?.target) ? parsed.target as DocumentTarget : "unknown";
  const confidence = Number(parsed?.confidence ?? 0.5);
  const rawPeriod = parsed?.period ? String(parsed.period).trim().slice(0, 80) : "";
  const safePeriod = target === "quarterly"
    ? (/^[TQ][1-4]\s+20\d{2}$/i.test(rawPeriod) ? rawPeriod.replace(/^Q/i, "T") : null)
    : target === "monthly"
      ? (/^(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez)\s+20\d{2}$/i.test(rawPeriod) ? rawPeriod : null)
      : target === "strategic"
        ? (/^20\d{2}$/.test(rawPeriod) ? rawPeriod : null)
        : null;
  return {
    target,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
    reason: String(parsed?.reason ?? "Classificação feita pela IA.").slice(0, 500),
    areaName: parsed?.areaName ? String(parsed.areaName).slice(0, 180) : null,
    period: safePeriod,
    nextQuestion: parsed?.nextQuestion ? String(parsed.nextQuestion).slice(0, 500) : null,
  };
}

async function processIncomingDocument(
  client: ReturnType<typeof serviceClient>,
  orgId: string,
  areaId: string | null,
  whatsappSettings: any,
  whatsappKeyRow: any,
  payload: any,
  profile: any,
) {
  const diagnostics: string[] = [];
  const file = await resolveDocumentFile(whatsappSettings, whatsappKeyRow, payload, diagnostics);
  if (!file) {
    return {
      userText: "[Arquivo recebido sem leitura]",
      answer: `Recebi o arquivo, mas ainda não consegui baixar ou ler por aqui.\n\nCódigo técnico: ${diagnostics.slice(-6).join(" | ") || "sem-diagnostico"}`,
    };
  }

  try {
    const extractedText = await extractDocumentText(file);
    const classification = await classifyImportedDocument(client, orgId, areaId, file.fileName, extractedText, profile);
    if (classification.target === "strategic") {
      const year = classification.period?.match(/\b(20\d{2})\b/)?.[1] ?? String(new Date().getFullYear());
      const prepared = await prepareReadyStrategicPlanProposal(client, {
        orgId,
        areaId: null,
        period: year,
        planText: extractedText,
        fileName: file.fileName,
        userId: profile.id,
        channel: "whatsapp",
      });
      return {
        userText: importedConversationReceipt(file.fileName, targetLabel(classification.target)),
        answer: `${prepared.reply}\n\nSe estiver coerente, responda *confirmar* que eu gravo no módulo.`,
        skipHistory: true,
      };
    }

    if (classification.target === "quarterly" || classification.target === "monthly") {
      const matchedAreaId = await resolveDocumentAreaId(
        client,
        orgId,
        `${classification.areaName ?? ""}\n${extractedText.slice(0, 3000)}`,
        areaId,
      );
      if (!matchedAreaId) {
        return {
          userText: importedConversationReceipt(file.fileName, targetLabel(classification.target)),
          answer: `Recebi e li o arquivo "${file.fileName}". Ele parece um ${targetLabel(classification.target).toLowerCase()}, mas preciso saber de qual departamento ele é antes de montar a proposta. Me diga o nome do departamento e eu continuo.`,
          skipHistory: false,
        };
      }

      const period = classification.period ?? periodForPlanning(classification.target === "quarterly" ? "quarterly" : "monthly", null, extractedText);
      const prepared = classification.target === "quarterly"
        ? await prepareReadyQuarterlyPlanProposal(client, {
          orgId,
          areaId: matchedAreaId,
          period,
          planText: extractedText,
          fileName: file.fileName,
          userId: profile.id,
          channel: "whatsapp",
        })
        : await prepareReadyMonthlyPlanProposal(client, {
          orgId,
          areaId: matchedAreaId,
          period,
          planText: extractedText,
          fileName: file.fileName,
          userId: profile.id,
          channel: "whatsapp",
        });

      return {
        userText: importedConversationReceipt(file.fileName, targetLabel(classification.target)),
        answer: `${prepared.reply}\n\nSe estiver coerente, responda *confirmar* que eu gravo no módulo e gero o documento padrão.`,
        skipHistory: true,
      };
    }

    const route = targetRoute(classification.target);
    const confidence = Math.round((classification.confidence || 0) * 100);
    const areaText = classification.areaName ? `\nÁrea provável: ${classification.areaName}.` : "";
    const periodText = classification.period ? `\nPeríodo provável: ${classification.period}.` : "";
    const nextQuestion = classification.nextQuestion || "Você quer que eu use esse arquivo como base para revisar esse plano?";
    const answer =
      classification.target === "unknown"
        ? `Recebi e li o arquivo "${file.fileName}", mas ainda não consegui definir se ele é estratégico, trimestral, mensal ou evidência. ${nextQuestion}`
        : `Recebi e li o arquivo "${file.fileName}". Ele parece pertencer a: ${targetLabel(classification.target)} (${confidence}% de confiança).${areaText}${periodText}\nCaminho no Oráculo: ${route}.\n${nextQuestion}`;

    return {
      userText: importedConversationReceipt(file.fileName, targetLabel(classification.target)),
      answer,
      skipHistory: false,
    };
  } catch (error) {
    return {
      userText: `[Arquivo recebido sem extração] ${file.fileName}`,
      answer: `Recebi o arquivo "${file.fileName}", mas não consegui extrair texto suficiente. ${error instanceof Error ? error.message : "Tente enviar uma versão com texto selecionável."}`,
      skipHistory: false,
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let dedupeClient: ReturnType<typeof serviceClient> | null = null;
  let dedupeOrgId = "";
  let dedupeEventKey = "";

  try {
    const url = new URL(req.url);
    const payload = await req.json();
    const client = serviceClient();
    const requestedOrgId = url.searchParams.get("orgId") ?? payload?.orgId ?? null;
    const instanceName = extractInstanceName(payload);

    // Resolve os settings primeiro pelo orgId da URL; se nao achar (ex.: org recriada com novo id
    // e URL desatualizada na Evolution), cai de volta para o instance_name, que e estavel. Isso
    // evita 404 silencioso e a parada muda do WhatsApp quando o orgId da URL fica velho.
    let whatsappSettings: any = null;
    if (requestedOrgId) {
      const byOrg = await client.from("whatsapp_settings").select("*").eq("enabled", true).eq("org_id", requestedOrgId).maybeSingle();
      if (byOrg.error) throw byOrg.error;
      whatsappSettings = byOrg.data;
    }
    if (!whatsappSettings && instanceName) {
      const byInstance = await client.from("whatsapp_settings").select("*").eq("enabled", true).eq("instance_name", instanceName).maybeSingle();
      if (byInstance.error) throw byInstance.error;
      whatsappSettings = byInstance.data;
    }
    if (!whatsappSettings) return jsonResponse({ error: "WhatsApp não configurado para esta empresa" }, 404);

    const { data: whatsappKeyRow, error: whatsappKeyError } = await client
      .from("whatsapp_instance_keys")
      .select("*")
      .eq("org_id", whatsappSettings.org_id)
      .maybeSingle();
    if (whatsappKeyError) throw whatsappKeyError;

    const receivedSecret =
      req.headers.get("x-oraculo-webhook-secret") ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const headerAuthorized = Boolean(
      whatsappKeyRow?.webhook_secret && receivedSecret && timingSafeEqual(receivedSecret, whatsappKeyRow.webhook_secret),
    );

    // Evo Go Manager nao expoe campo de header customizado. Para essa variante, aceitamos
    // um bearer derivado na URL em vez do segredo bruto salvo no banco.
    const receivedEvoGoToken = url.searchParams.get("evoGoToken") ?? "";
    const expectedEvoGoToken =
      !headerAuthorized && whatsappKeyRow?.webhook_secret && requestedOrgId
        ? await deriveEvoGoWebhookToken(whatsappKeyRow.webhook_secret, whatsappSettings.org_id)
        : "";
    const evoGoUrlAuthorized = Boolean(expectedEvoGoToken && receivedEvoGoToken && timingSafeEqual(receivedEvoGoToken, expectedEvoGoToken));

    if (!headerAuthorized && !evoGoUrlAuthorized) {
      return jsonResponse({ error: "Webhook não autorizado" }, 401);
    }

    if (isMessageFromCurrentInstance(payload, whatsappSettings)) return jsonResponse({ ok: true, ignored: "from_me" });

    const extractedText = extractText(payload);
    const hasAudio = Boolean(extractAudioInfo(payload));
    const hasDocument = Boolean(extractDocumentInfo(payload));
    const phone = normalizePhone(extractRemote(payload));
    if ((!extractedText && !hasAudio && !hasDocument) || !phone) return jsonResponse({ ok: true, ignored: true });

    const orgId = whatsappSettings.org_id as string;
    const eventKey = await buildWebhookEventKey(payload, phone, extractedText, hasAudio, hasDocument);

    if (whatsappSettings.inbound_queue_enabled === true) {
      const phoneOptions = phoneCandidates(phone);
      const { data: queuedProfile, error: queuedProfileError } = await client
        .from("profiles")
        .select("id")
        .in("phone", phoneOptions)
        .maybeSingle();
      if (queuedProfileError) throw queuedProfileError;

      let queuedUserId: string | null = null;
      if (queuedProfile?.id) {
        const { data: queuedMembership, error: queuedMembershipError } = await client
          .from("memberships")
          .select("id")
          .eq("org_id", orgId)
          .eq("user_id", queuedProfile.id)
          .maybeSingle();
        if (queuedMembershipError) throw queuedMembershipError;
        if (queuedMembership) queuedUserId = queuedProfile.id;
      }

      const kind: WhatsAppInboundKind = hasDocument ? "document" : hasAudio ? "audio" : "text";
      const mediaInfo = kind === "document" ? extractDocumentInfo(payload) : kind === "audio" ? extractAudioInfo(payload) : null;
      const jobPayload = sanitizeWhatsAppInboundPayload(kind, {
        messageId: extractWebhookMessageId(payload),
        text: extractedText,
        remoteJid: mediaInfo?.key?.remoteJid,
        mimeType: mediaInfo?.mimeType,
        fileName: kind === "document" ? mediaInfo?.fileName : undefined,
        caption: extractedText,
      });
      const { data: queuedRows, error: queueError } = await client.rpc("enqueue_whatsapp_inbound_job", {
        p_org_id: orgId,
        p_event_key: eventKey,
        p_phone: phone,
        p_user_id: queuedUserId,
        p_kind: kind,
        p_payload: jobPayload,
      });
      if (queueError) throw queueError;
      const queued = queuedRows?.[0];
      if (!queued?.job_id || !queued?.correlation_id) throw new Error("Fila do WhatsApp não devolveu o job criado");

      return jsonResponse({
        ok: true,
        queued: true,
        duplicate: queued.inserted !== true,
        correlationId: queued.correlation_id,
      });
    }

    const { error: dedupeError } = await client.from("whatsapp_processed_events").insert({ org_id: orgId, event_key: eventKey });
    if (dedupeError) {
      if (dedupeError.code === "23505") return jsonResponse({ ok: true, duplicate: true });
      throw dedupeError;
    }
    dedupeClient = client;
    dedupeOrgId = orgId;
    dedupeEventKey = eventKey;

    const phoneOptions = phoneCandidates(phone);
    const { data: profile } = await client.from("profiles").select("id, full_name, phone").in("phone", phoneOptions).maybeSingle();
    if (!profile) {
      await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, phone, "Este número não está cadastrado no Oráculo. Peça ao dono da empresa para vincular seu celular.");
      return jsonResponse({ ok: true, rejected: "unknown_phone" });
    }
    const replyPhone = profile.phone ?? phone;

    const { data: membership } = await client
      .from("memberships")
      .select("id, role")
      .eq("org_id", orgId)
      .eq("user_id", profile.id)
      .maybeSingle();
    if (!membership) {
      await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, "Seu número existe, mas não tem acesso a esta empresa no Oráculo.");
      return jsonResponse({ ok: true, rejected: "no_membership" });
    }

    const { data: area } = await client
      .from("areas")
      .select("id")
      .eq("org_id", orgId)
      .eq("coordinator_id", membership.id)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    const areaId = area?.id ?? null;
    const conversation = await getOrCreateConversation(client, {
      orgId,
      userId: profile.id,
      channel: "whatsapp",
      areaId,
    });

    if (hasDocument) {
      const result = await processIncomingDocument(client, orgId, areaId, whatsappSettings, whatsappKeyRow, payload, profile);

      if (!result.skipHistory) {
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "user",
          text: result.userText,
          channel: "whatsapp",
        });

        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "oracle",
          text: result.answer,
          channel: "whatsapp",
        });
      }

      await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, result.answer);
      return jsonResponse({ ok: true, document: "processed" });
    }

    let text = extractedText;
    let wasTranscribedAudio = false;
    const audioDiagnostics: string[] = [];

    if (!text && hasAudio) {
      try {
        text = await transcribeIncomingAudio(client, orgId, profile.id, whatsappSettings, whatsappKeyRow, payload, audioDiagnostics);
        wasTranscribedAudio = Boolean(text);
      } catch (error) {
        console.error("Erro ao transcrever áudio do WhatsApp", error instanceof Error ? error.message : String(error));
        if (isAiControlLimitError(error)) {
          await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, error.message);
          return jsonResponse({ ok: true, audio: "ai_limit" });
        }
        audioDiagnostics.push("transcription-error");
      }
    }

    if (!text) {
      const audioFailureText = "[Áudio recebido sem transcrição]";
      const diagnosticCode = audioDiagnostics.slice(-6).join(" | ") || "sem-diagnostico";
      const answer = `Recebi seu áudio, mas ainda não consegui transcrever por aqui. Pode me mandar em texto por enquanto?\n\nCódigo técnico: ${diagnosticCode}`;

      await insertConversationMessage(client, {
        orgId,
        areaId,
        userId: profile.id,
        conversationId: conversation.id,
        author: "user",
        text: audioFailureText,
        channel: "whatsapp",
      });

      await insertConversationMessage(client, {
        orgId,
        areaId,
        userId: profile.id,
        conversationId: conversation.id,
        author: "oracle",
        text: answer,
        channel: "whatsapp",
      });

      await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, answer);
      return jsonResponse({ ok: true, audio: "transcription_failed" });
    }

    const storedUserText = wasTranscribedAudio ? `[Áudio transcrito] ${text}` : text;

    const confirmationMessage = isConfirmationMessage(text);
    const pendingContext = pendingConversationContext(conversation);

    if (pendingContext?.type === "weekly_capture") {
      await client.from("conversations").update({ pending_context: {} }).eq("id", conversation.id);
      if (confirmationMessage) {
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "user",
          text: storedUserText,
          channel: "whatsapp",
        });
        const quickUpdate = await handleQuickUpdate(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          message: String(pendingContext.originalText ?? ""),
          channel: "whatsapp",
        });
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "oracle",
          text: quickUpdate.reply,
          channel: "whatsapp",
        });
        await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, quickUpdate.reply);
        return jsonResponse({ ok: true, intent: "weekly_capture_confirmed" });
      }
      if (isRejectionMessage(text)) {
        const reply = "Tudo certo. Obrigado por compartilhar; fica só na conversa e seguimos daqui.";
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "user",
          text: storedUserText,
          channel: "whatsapp",
        });
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "oracle",
          text: reply,
          channel: "whatsapp",
        });
        await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, reply);
        return jsonResponse({ ok: true, intent: "weekly_capture_declined" });
      }
    }

    if (pendingContext?.type === "weekly_pulse") {
      await client.from("weekly_pulse_log").update({ responded_at: new Date().toISOString() })
        .eq("org_id", orgId)
        .eq("membership_id", membership.id)
        .eq("week_start", String(pendingContext.weekStart ?? ""));

      const weeklyIntent = await classifyOracleIntent(client, {
        orgId,
        message: text,
        channel: "whatsapp",
        areaId,
        conversationId: conversation.id,
      });
      await client.from("conversations").update({ pending_context: {} }).eq("id", conversation.id);

      if (weeklyIntent.intent === "quick_update") {
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "user",
          text: storedUserText,
          channel: "whatsapp",
        });
        await maybeSummarize(client, orgId, conversation);
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
        await client.from("conversations").update({
          pending_context: { type: "weekly_capture", originalText: text, expiresAt },
        }).eq("id", conversation.id);
        const answer = await buildAnswer(
          client,
          orgId,
          areaId,
          text,
          profile,
          membership,
          conversation,
          [
            "A pessoa está respondendo ao convite leve sobre a semana e relatou um avanço, sucesso ou dificuldade concreta.",
            "Reconheça o que aconteceu antes de falar em registro. Responda em uma ou duas frases naturais.",
            "Termine perguntando se ela quer que você registre isso no objetivo ou ação correspondente. Não diga que já registrou.",
          ].join("\n"),
        );
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "oracle",
          text: answer,
          channel: "whatsapp",
        });
        await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, answer);
        return jsonResponse({ ok: true, intent: "weekly_pulse_update" });
      }
    }

    if (!confirmationMessage && isClearlyGeneralTopic(text)) {
      await insertConversationMessage(client, {
        orgId,
        areaId,
        userId: profile.id,
        conversationId: conversation.id,
        author: "user",
        text: storedUserText,
        channel: "whatsapp",
      });
      await maybeSummarize(client, orgId, conversation);

      const answer = await buildOutOfScopeReply(client, orgId, profile, conversation, text);

      await insertConversationMessage(client, {
        orgId,
        areaId,
        userId: profile.id,
        conversationId: conversation.id,
        author: "oracle",
        text: answer,
        channel: "whatsapp",
      });

      await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, answer);
      return jsonResponse({ ok: true, scope: "redirected" });
    }

    const { data: activeSessions, error: activeSessionError } = await client
      .from("planning_sessions")
      .select("id, conversation_id, pending_proposal")
      .eq("org_id", orgId)
      .eq("user_id", profile.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(5);
    if (activeSessionError) throw activeSessionError;

    const resumeRequested = isExplicitPlanningResume(text);
    const activeSession = confirmationMessage
      ? (activeSessions ?? []).find((session: any) => session.pending_proposal) ?? null
      : resumeRequested
        ? activeSessions?.[0] ?? null
        : (activeSessions ?? []).find((session: any) => session.conversation_id === conversation.id) ?? null;

    if (activeSession) {
      if (activeSession.conversation_id !== conversation.id) {
        const { error: rebindError } = await client
          .from("planning_sessions")
          .update({ conversation_id: conversation.id })
          .eq("id", activeSession.id);
        if (rebindError) throw rebindError;
      }
      const sessionResult = activeSession.pending_proposal && confirmationMessage
        ? await confirmPlanningProposal(client, { sessionId: activeSession.id, userId: profile.id, channel: "whatsapp", confirmationText: storedUserText })
        : await processPlanningMessage(client, { sessionId: activeSession.id, message: storedUserText, userId: profile.id, channel: "whatsapp" });
      await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, sessionResult.reply);
      return jsonResponse({ ok: true, session: "processed" });
    }

    await insertConversationMessage(client, {
      orgId,
      areaId,
      userId: profile.id,
      conversationId: conversation.id,
      author: "user",
      text: storedUserText,
      channel: "whatsapp",
    });
    await maybeSummarize(client, orgId, conversation);

    const intent = await classifyOracleIntent(client, {
      orgId,
      message: text,
      channel: "whatsapp",
      areaId,
      conversationId: conversation.id,
    });

    if (intent.intent === "start_planning") {
      if (!intent.planning_type) {
        const reply = "Claro. Qual plano você quer montar agora: *estratégico anual*, *trimestral* ou *mensal*?";
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "oracle",
          text: reply,
          channel: "whatsapp",
        });
        await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, reply);
        return jsonResponse({ ok: true, intent: "start_planning_missing_type" });
      }

      const sessionResult = await startPlanningSession(client, {
        orgId,
        areaId: intent.planning_type === "strategic" ? null : areaId,
        type: intent.planning_type,
        period: periodForPlanning(intent.planning_type, intent.period_hint, text),
        userId: profile.id,
        channel: "whatsapp",
      });
      const reply = `Vou te conduzir por aqui mesmo.\n\n${sessionResult.reply}`;
      await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, reply);
      return jsonResponse({ ok: true, intent: "start_planning", sessionId: sessionResult.session.id });
    }

    if (intent.intent === "quick_update") {
      const quickUpdate = await handleQuickUpdate(client, {
        orgId,
        areaId,
        userId: profile.id,
        conversationId: conversation.id,
        message: text,
        channel: "whatsapp",
      });
      if (quickUpdate.handled) {
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "oracle",
          text: quickUpdate.reply,
          channel: "whatsapp",
        });
        await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, quickUpdate.reply);
        return jsonResponse({ ok: true, intent: "quick_update" });
      }
    }

    if (intent.intent === "close_period") {
      const closeType = intent.planning_type === "quarterly" ? "quarter_close" : "month_close";
      if (!areaId) {
        const reply = closeType === "quarter_close"
          ? "Claro. De qual departamento você quer fechar o trimestre?"
          : "Claro. De qual departamento você quer fechar o mês?";
        await insertConversationMessage(client, {
          orgId,
          areaId,
          userId: profile.id,
          conversationId: conversation.id,
          author: "oracle",
          text: reply,
          channel: "whatsapp",
        });
        await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, reply);
        return jsonResponse({ ok: true, intent: "close_period_missing_area" });
      }
      const sessionResult = await startPlanningSession(client, {
        orgId,
        areaId,
        type: closeType,
        period: periodForClose(closeType === "quarter_close" ? "quarterly" : "monthly", intent.period_hint, text),
        userId: profile.id,
        channel: "whatsapp",
      });
      const reply = `Vou conduzir o fechamento por aqui mesmo.\n\n${sessionResult.reply}`;
      await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, reply);
      return jsonResponse({ ok: true, intent: "close_period", sessionId: sessionResult.session.id });
    }

    if (intent.intent === "document_question") {
      const reply = await answerDocumentQuestion(client, {
        orgId,
        areaId,
        message: text,
        planningType: intent.planning_type,
        periodHint: intent.period_hint,
      });
      await insertConversationMessage(client, {
        orgId,
        areaId,
        userId: profile.id,
        conversationId: conversation.id,
        author: "oracle",
        text: reply,
        channel: "whatsapp",
      });
      await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, reply);
      return jsonResponse({ ok: true, intent: "document_question" });
    }

    const answer = await buildAnswer(client, orgId, areaId, text, profile, membership, conversation);

    await insertConversationMessage(client, {
      orgId,
      areaId,
      userId: profile.id,
      conversationId: conversation.id,
      author: "oracle",
      text: answer,
      channel: "whatsapp",
    });

    await sendFormattedWhatsApp(whatsappSettings, whatsappKeyRow, replyPhone, answer);
    return jsonResponse({ ok: true });
  } catch (error) {
    if (dedupeClient && dedupeOrgId && dedupeEventKey) {
      await dedupeClient.from("whatsapp_processed_events").delete().eq("org_id", dedupeOrgId).eq("event_key", dedupeEventKey);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro no webhook do WhatsApp" }, 400);
  }
});
