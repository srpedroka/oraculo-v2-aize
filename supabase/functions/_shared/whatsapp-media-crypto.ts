import { isWhatsAppPlainTextDocument } from "./whatsapp-text.ts";

function base64ToBytes(value: string) {
  const clean = value
    .replace(/^data:[^,]+,/, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/\s/g, "");
  const padded = clean.padEnd(Math.ceil(clean.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function decryptWhatsAppMedia(bytes: Uint8Array, mediaKey: string, info: string) {
  const mediaKeyBytes = base64ToBytes(mediaKey);
  const baseKey = await crypto.subtle.importKey("raw", mediaKeyBytes, "HKDF", false, ["deriveBits"]);
  const derivedBits = await crypto.subtle.deriveBits({
    name: "HKDF",
    hash: "SHA-256",
    salt: new Uint8Array(32),
    info: new TextEncoder().encode(info),
  }, baseKey, 112 * 8);
  const derived = new Uint8Array(derivedBits);
  const cryptoKey = await crypto.subtle.importKey("raw", derived.slice(16, 48), { name: "AES-CBC" }, false, ["decrypt"]);
  const encrypted = bytes.length > 10 ? bytes.slice(0, -10) : bytes;
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv: derived.slice(0, 16) }, cryptoKey, encrypted));
}

function looksLikePlainTextBytes(bytes: Uint8Array) {
  if (!bytes.length) return false;
  let decoded = "";
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return false;
  }
  if (!decoded.trim()) return false;
  const controls = Array.from(decoded).filter((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
  }).length;
  return controls / Math.max(decoded.length, 1) <= 0.01;
}

function looksLikeZip(bytes: Uint8Array) {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function looksLikePdf(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes.slice(0, 4)).startsWith("%PDF");
}

export function looksLikeDecryptedDocumentBytes(bytes: Uint8Array, fileName: string, mimeType: string) {
  if (looksLikePdf(bytes) || looksLikeZip(bytes)) return true;
  return isWhatsAppPlainTextDocument(fileName, mimeType) && looksLikePlainTextBytes(bytes);
}

export async function decryptWhatsAppAudio(bytes: Uint8Array, mediaKey: string) {
  return await decryptWhatsAppMedia(bytes, mediaKey, "WhatsApp Audio Keys");
}

export async function decryptWhatsAppDocument(bytes: Uint8Array, mediaKey: string) {
  return await decryptWhatsAppMedia(bytes, mediaKey, "WhatsApp Document Keys");
}
