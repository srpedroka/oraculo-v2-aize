import { serviceClient } from "./auth.ts";
import { evaluateAiControls } from "./ai-controls.ts";
import { buildEvolutionMediaAttempts } from "./evolution-media.ts";
import { normalizeAudioFile, transcribeAudioWithOpenAi, type AudioFile } from "./transcription.ts";
import { audioFileFromBase64, extractAudioInfo, extractDocumentInfo, extractText, firstText, mediaFileFromBase64 } from "./whatsapp-event.ts";
import { whatsappFileExtension as fileExtension } from "./whatsapp-text.ts";

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

async function extractPdfTextFromBytes(bytes: Uint8Array) {
  // @ts-ignore NPM import is resolved by Supabase Edge/Deno at deploy/runtime.
  const { extractText, getDocumentProxy } = await import("npm:unpdf@1.6.2");
  const pdf = await getDocumentProxy(bytes);
  try {
    const result = await extractText(pdf, { mergePages: true });
    const text = Array.isArray(result.text) ? result.text.join("\n\n") : String(result.text ?? "");
    return ensureImportedText(
      text,
      "O PDF não tem uma camada de texto legível. Envie um PDF com texto selecionável ou uma versão convertida por OCR.",
    );
  } finally {
    await Promise.resolve(pdf.destroy?.()).catch(() => undefined);
  }
}

export async function extractDocumentText(file: AudioFile) {
  const extension = fileExtension(file.fileName);
  if (extension === ".txt" || file.mimeType.includes("text/")) {
    return ensureImportedText(new TextDecoder().decode(file.bytes), "O TXT está vazio.");
  }
  if (extension === ".pptx" || file.mimeType.includes("presentation")) return await extractPptxTextFromBytes(file.bytes);
  if (extension === ".docx" || file.mimeType.includes("wordprocessing")) return await extractDocxTextFromBytes(file.bytes);
  if (extension === ".pdf" || file.mimeType.includes("pdf") || looksLikePdf(file.bytes)) return await extractPdfTextFromBytes(file.bytes);
  throw new Error("Formato não suportado pelo WhatsApp. Envie PDF, PPTX, DOCX ou TXT.");
}

export function documentExtractionFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/não tem uma camada de texto|não encontrei texto editável|está vazio|formato não suportado/i.test(message)) {
    return message;
  }
  return "Não consegui interpretar o conteúdo deste arquivo. Tente reenviar ou converter para PDF com texto selecionável ou TXT.";
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

  const attempts = buildEvolutionMediaAttempts(baseUrl, instanceName, {
    rawMessage: audioInfo.rawMessage,
    rawData: audioInfo.rawData,
    messageId: audioInfo.messageId || String(audioInfo.key.id ?? ""),
    key: audioInfo.key,
    mediaKey: firstText(audioInfo.audioMessage?.mediaKey, audioInfo.audioMessage?.MediaKey),
    directPath: firstText(audioInfo.audioMessage?.directPath, audioInfo.audioMessage?.DirectPath),
    url: firstText(audioInfo.audioMessage?.url, audioInfo.audioMessage?.URL),
    mimeType: audioInfo.mimeType,
    kind: "audio",
  });

  for (const { endpoint, body } of attempts) {
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

  const attempts = buildEvolutionMediaAttempts(baseUrl, instanceName, {
    rawMessage: documentInfo.rawMessage,
    rawData: documentInfo.rawData,
    messageId: documentInfo.messageId || String(documentInfo.key.id ?? ""),
    key: documentInfo.key,
    mediaKey: firstText(documentInfo.documentMessage?.mediaKey, documentInfo.documentMessage?.MediaKey),
    directPath: firstText(documentInfo.documentMessage?.directPath, documentInfo.documentMessage?.DirectPath),
    url: firstText(documentInfo.documentMessage?.url, documentInfo.documentMessage?.URL),
    mimeType: documentInfo.mimeType,
    kind: "document",
  });

  for (const { endpoint, body } of attempts) {
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

export async function resolveDocumentFile(settings: any, keyRow: any, payload: any, diagnostics: string[]) {
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

export async function transcribeIncomingAudio(
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

export function extractInstanceName(payload: any) {
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
