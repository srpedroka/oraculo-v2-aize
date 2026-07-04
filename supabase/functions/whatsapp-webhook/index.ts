import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serviceClient } from "../_shared/auth.ts";
import { resolveAiFunction } from "../_shared/ai-router.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callModel } from "../_shared/model.ts";
import { CONVERSATION_STYLE, STRATEGIC_GUIDE } from "../_shared/prompt-guides.ts";
import { decodeBase64Audio, normalizeAudioFile, transcribeAudioWithOpenAi, type AudioFile } from "../_shared/transcription.ts";
import { recordAiUsage } from "../_shared/usage.ts";
import { sendWhatsAppText } from "../_shared/whatsapp.ts";

function normalizePhone(value: unknown) {
  const source = String(value ?? "").trim();
  if (!source || source.includes("@lid")) return null;

  const raw = source.split("@")[0];
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

function buildWebhookEventKey(payload: any, phone: string, text: string, hasAudio: boolean, hasDocument: boolean) {
  const messageId = extractWebhookMessageId(payload);
  if (messageId) return `message:${phone}:${messageId}`;

  const kind = hasDocument ? "document" : hasAudio ? "audio" : "text";
  const minute = new Date().toISOString().slice(0, 16);
  const normalizedText = normalizeText(text).slice(0, 160) || "media";
  return `fallback:${phone}:${kind}:${normalizedText}:${minute}`;
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

async function downloadAudioFromUrl(url: string, keyRow: any, mimeType: string, diagnostics?: string[]): Promise<AudioFile | null> {
  if (!url.startsWith("http")) return null;
  const response = await fetch(url, {
    headers: keyRow?.api_key ? { apikey: keyRow.api_key } : undefined,
  }).catch(() => null);
  if (!response?.ok) {
    diagnostics?.push(`url:${response?.status ?? "no-response"}`);
    return null;
  }

  const contentType = response.headers.get("content-type") ?? mimeType;
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    bytes,
    mimeType: contentType || mimeType,
    fileName: contentType.includes("mpeg") ? "whatsapp-audio.mp3" : "whatsapp-audio.ogg",
  };
}

async function downloadMediaFromUrl(url: string, keyRow: any, mimeType: string, fileName: string, diagnostics?: string[]): Promise<AudioFile | null> {
  if (!url.startsWith("http")) return null;
  const response = await fetch(url, {
    headers: keyRow?.api_key ? { apikey: keyRow.api_key } : undefined,
  }).catch(() => null);
  if (!response?.ok) {
    diagnostics?.push(`doc-url:${response?.status ?? "no-response"}`);
    return null;
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
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
    const file = await downloadAudioFromUrl(audioInfo.url, keyRow, audioInfo.mimeType, diagnostics);
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
  if (!file && documentInfo.url) file = await downloadMediaFromUrl(documentInfo.url, keyRow, documentInfo.mimeType, documentInfo.fileName, diagnostics);
  if (!file) file = await downloadDocumentFromEvolution(settings, keyRow, documentInfo, diagnostics);

  if (!file) return null;
  return await maybeDecryptWhatsAppDocument(file, documentInfo, diagnostics);
}

async function transcribeIncomingAudio(
  client: ReturnType<typeof serviceClient>,
  orgId: string,
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

async function buildAnswer(
  client: ReturnType<typeof serviceClient>,
  orgId: string,
  areaId: string | null,
  message: string,
  profile: any,
  membership: any,
  currentMessageId: string | null,
) {
  const aiRoute = await resolveAiFunction(client, orgId, "daily");
  const [
    { data: organization },
    { data: objectives },
    { data: areas },
    { data: strategicPlan },
    { data: areaPlans },
    { data: history },
  ] =
    await Promise.all([
      client.from("organizations").select("name, subtitle").eq("id", orgId).maybeSingle(),
      client.from("objectives").select("*").eq("org_id", orgId).order("created_at"),
      client.from("areas").select("*").eq("org_id", orgId).order("created_at"),
      client.from("strategic_plans").select("*").eq("org_id", orgId).order("year", { ascending: false }).limit(1).maybeSingle(),
      client.from("area_plans").select("*").eq("org_id", orgId),
      client.from("chat_messages").select("id, author, text").eq("org_id", orgId).order("created_at", { ascending: false }).limit(20),
    ]);

  const currentArea = (areas ?? []).find((area: any) => area.id === areaId) ?? null;

  if (!aiRoute) {
    return isOpeningMessage(message) ? openingAnswer(profile, organization) : contextualFallback(profile, organization, objectives ?? [], message);
  }

  const systemPrompt = [
    "Você é o Oráculo, a IA estratégica da empresa. Responda em português do Brasil.",
    "Você está conversando por WhatsApp: seja curto, natural, amigável e contextual.",
    "Comportamento obrigatório:",
    `- O contato atual é ${profile?.full_name ?? "usuário sem nome"} (${membership?.role ?? "sem papel"}).`,
    `- Área vinculada ao contato: ${currentArea?.name ?? "sem área específica"}.`,
    `- Horário local do atendimento: ${localTimestamp()}.`,
    "- Mesmo se a mensagem for apenas saudação, teste ou abertura sem pedido claro, responda pela IA com naturalidade. Cumprimente pelo horário quando fizer sentido, chame pelo primeiro nome e pergunte de forma leve o que a pessoa quer fazer. Não use texto fixo nem faça análise do plano nesse caso.",
    "- Se a pessoa perguntar 'como está o sistema?', 'está funcionando?' ou algo parecido, trate como pergunta ambígua sobre o software/WhatsApp. Responda que recebeu a mensagem e pergunte se ela quer falar do funcionamento do Oráculo ou do status dos planos.",
    "- Se a mensagem trouxer pedido, evidência, dúvida ou contexto, use exatamente o que foi dito e o histórico para conduzir a resposta. Não pare só na saudação.",
    "- Se citar claramente status do plano, objetivos, metas ou indicadores, cite objetivos concretos do plano. Se pedir evidência, diga qual evidência falta.",
    "- Responda em 1 a 3 frases curtas no WhatsApp. Termine com uma pergunta só quando ela ajudar a conversa.",
    "Nunca diga que salvou algo se a ação não foi gravada pelo sistema.",
    CONVERSATION_STYLE,
    STRATEGIC_GUIDE,
    "Contexto atual do plano:",
    JSON.stringify({ organization, strategicPlan, areaPlans, areas, objectives, areaId, currentContact: { profile, membership, area: currentArea } }, null, 2),
  ].join("\n\n");

  const modelMessages = [
    ...(history ?? [])
      .filter((item: { id?: string }) => item.id !== currentMessageId)
      .reverse()
      .map((item: { author: "oracle" | "user"; text: string }) => ({
        role: item.author === "oracle" ? "assistant" as const : "user" as const,
        content: item.text,
      })),
    { role: "user" as const, content: message },
  ];

  try {
    const result = await callModel(aiRoute.provider, aiRoute.model, aiRoute.apiKey, systemPrompt, modelMessages, aiRoute.limits);
    await recordAiUsage({
      client,
      orgId,
      provider: aiRoute.provider,
      model: aiRoute.model,
      channel: "whatsapp",
      usage: result.usage,
      settings: aiRoute.legacySettings,
      metadata: { areaId, phone: profile?.phone ?? null, aiFunction: "daily" },
    });
    return result.text;
  } catch (_error) {
    console.error("Erro ao chamar IA no WhatsApp", _error instanceof Error ? _error.message : String(_error));
    return contextualFallback(profile, organization, objectives ?? [], message);
  }
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
      client.from("areas").select("id, name").eq("org_id", orgId).order("created_at"),
      client.from("strategic_plans").select("*").eq("org_id", orgId).order("year", { ascending: false }).limit(1).maybeSingle(),
      client.from("area_plans").select("*").eq("org_id", orgId),
      client.from("objectives").select("id, title, level, area_id, period").eq("org_id", orgId).order("created_at"),
    ]);

  if (!aiRoute) return classifyDocumentFallback(extractedText);

  const systemPrompt = [
    "Você classifica documentos enviados por WhatsApp para o sistema Oráculo.",
    "Responda somente JSON válido, sem markdown.",
    "Targets possíveis: strategic, quarterly, monthly, evidence, unknown.",
    "Use strategic para planejamento anual da empresa, SWOT, propósito, visão, temas do ano, objetivos estratégicos e projetos prioritários.",
    "Use quarterly para plano de área/departamento, objetivos trimestrais, Q1/Q2/Q3/Q4, entregas trimestrais ou desdobramento do anual.",
    "Use monthly para objetivos do mês, ações-chave, execução mensal, prazos dentro do mês ou check-in mensal.",
    "Use evidence para comprovantes de avanço: laudo, contrato, relatório, foto descrita, medição, nota, resultado entregue.",
    "Se não houver segurança, use unknown.",
    "Formato obrigatório: {\"target\":\"strategic|quarterly|monthly|evidence|unknown\",\"confidence\":0.0,\"reason\":\"curto\",\"areaName\":\"ou null\",\"period\":\"ou null\",\"nextQuestion\":\"uma pergunta curta\"}",
    "Contexto atual:",
    JSON.stringify({ areas, strategicPlan, areaPlans, objectives, currentAreaId: areaId, contact: profile?.full_name ?? null }, null, 2),
  ].join("\n\n");

  const result = await callModel(
    aiRoute.provider,
    aiRoute.model,
    aiRoute.apiKey,
    systemPrompt,
    [
      {
        role: "user",
        content: [`Arquivo: ${fileName}`, "Texto extraído:", extractedText.slice(0, 30000)].join("\n\n"),
      },
    ],
    aiRoute.limits,
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
  const target = ["strategic", "quarterly", "monthly", "evidence", "unknown"].includes(parsed?.target) ? parsed.target as DocumentTarget : "unknown";
  return {
    target,
    confidence: Number(parsed?.confidence ?? 0.5),
    reason: String(parsed?.reason ?? "Classificação feita pela IA."),
    areaName: parsed?.areaName ? String(parsed.areaName) : null,
    period: parsed?.period ? String(parsed.period) : null,
    nextQuestion: parsed?.nextQuestion ? String(parsed.nextQuestion) : null,
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
      userText: `[Arquivo recebido] ${file.fileName} · ${targetLabel(classification.target)} · ${extractedText.slice(0, 1200)}`,
      answer,
    };
  } catch (error) {
    return {
      userText: `[Arquivo recebido sem extração] ${file.fileName}`,
      answer: `Recebi o arquivo "${file.fileName}", mas não consegui extrair texto suficiente. ${error instanceof Error ? error.message : "Tente enviar uma versão com texto selecionável."}`,
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

    let settingsQuery = client.from("whatsapp_settings").select("*").eq("enabled", true);
    settingsQuery = requestedOrgId ? settingsQuery.eq("org_id", requestedOrgId) : settingsQuery.eq("instance_name", instanceName);
    const { data: whatsappSettings, error: settingsError } = await settingsQuery.maybeSingle();
    if (settingsError) throw settingsError;
    if (!whatsappSettings) return jsonResponse({ error: "WhatsApp não configurado para esta empresa" }, 404);

    const { data: whatsappKeyRow, error: whatsappKeyError } = await client
      .from("whatsapp_instance_keys")
      .select("*")
      .eq("org_id", whatsappSettings.org_id)
      .maybeSingle();
    if (whatsappKeyError) throw whatsappKeyError;

    const receivedSecret =
      req.headers.get("x-oraculo-webhook-secret") ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      url.searchParams.get("secret");
    if (!whatsappKeyRow?.webhook_secret || receivedSecret !== whatsappKeyRow.webhook_secret) {
      return jsonResponse({ error: "Webhook não autorizado" }, 401);
    }

    const extractedText = extractText(payload);
    const hasAudio = Boolean(extractAudioInfo(payload));
    const hasDocument = Boolean(extractDocumentInfo(payload));
    const phone = normalizePhone(extractRemote(payload));
    if ((!extractedText && !hasAudio && !hasDocument) || !phone) return jsonResponse({ ok: true, ignored: true });

    const orgId = whatsappSettings.org_id as string;
    const eventKey = buildWebhookEventKey(payload, phone, extractedText, hasAudio, hasDocument);
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
      await sendWhatsAppText(whatsappSettings, whatsappKeyRow, phone, "Este número não está cadastrado no Oráculo. Peça ao dono da empresa para vincular seu celular.");
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
      await sendWhatsAppText(whatsappSettings, whatsappKeyRow, replyPhone, "Seu número existe, mas não tem acesso a esta empresa no Oráculo.");
      return jsonResponse({ ok: true, rejected: "no_membership" });
    }

    const { data: area } = await client.from("areas").select("id").eq("org_id", orgId).eq("coordinator_id", membership.id).maybeSingle();
    const areaId = area?.id ?? null;

    if (hasDocument) {
      const result = await processIncomingDocument(client, orgId, areaId, whatsappSettings, whatsappKeyRow, payload, profile);

      await client.from("chat_messages").insert({
        org_id: orgId,
        area_id: areaId,
        author: "user",
        text: result.userText,
        channel: "whatsapp",
      });

      await client.from("chat_messages").insert({
        org_id: orgId,
        area_id: areaId,
        author: "oracle",
        text: result.answer,
        channel: "whatsapp",
      });

      await sendWhatsAppText(whatsappSettings, whatsappKeyRow, replyPhone, result.answer);
      return jsonResponse({ ok: true, document: "processed" });
    }

    let text = extractedText;
    let wasTranscribedAudio = false;
    const audioDiagnostics: string[] = [];

    if (!text && hasAudio) {
      try {
        text = await transcribeIncomingAudio(client, orgId, whatsappSettings, whatsappKeyRow, payload, audioDiagnostics);
        wasTranscribedAudio = Boolean(text);
      } catch (error) {
        console.error("Erro ao transcrever áudio do WhatsApp", error instanceof Error ? error.message : String(error));
        audioDiagnostics.push("transcription-error");
      }
    }

    if (!text) {
      const audioFailureText = "[Áudio recebido sem transcrição]";
      const diagnosticCode = audioDiagnostics.slice(-6).join(" | ") || "sem-diagnostico";
      const answer = `Recebi seu áudio, mas ainda não consegui transcrever por aqui. Pode me mandar em texto por enquanto?\n\nCódigo técnico: ${diagnosticCode}`;

      await client.from("chat_messages").insert({
        org_id: orgId,
        area_id: areaId,
        author: "user",
        text: audioFailureText,
        channel: "whatsapp",
      });

      await client.from("chat_messages").insert({
        org_id: orgId,
        area_id: areaId,
        author: "oracle",
        text: answer,
        channel: "whatsapp",
      });

      await sendWhatsAppText(whatsappSettings, whatsappKeyRow, replyPhone, answer);
      return jsonResponse({ ok: true, audio: "transcription_failed" });
    }

    const storedUserText = wasTranscribedAudio ? `[Áudio transcrito] ${text}` : text;

    const { data: savedUserMessage, error: userMessageError } = await client.from("chat_messages").insert({
      org_id: orgId,
      area_id: areaId,
      author: "user",
      text: storedUserText,
      channel: "whatsapp",
    }).select("id").single();
    if (userMessageError) throw userMessageError;

    const answer = await buildAnswer(client, orgId, areaId, text, profile, membership, savedUserMessage?.id ?? null);

    await client.from("chat_messages").insert({
      org_id: orgId,
      area_id: areaId,
      author: "oracle",
      text: answer,
      channel: "whatsapp",
    });

    await sendWhatsAppText(whatsappSettings, whatsappKeyRow, replyPhone, answer);
    return jsonResponse({ ok: true });
  } catch (error) {
    if (dedupeClient && dedupeOrgId && dedupeEventKey) {
      await dedupeClient.from("whatsapp_processed_events").delete().eq("org_id", dedupeOrgId).eq("event_key", dedupeEventKey);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro no webhook do WhatsApp" }, 400);
  }
});
