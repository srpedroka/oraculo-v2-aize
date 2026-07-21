import { describe, expect, it } from "vitest";
import { decryptWhatsAppDocument, looksLikeDecryptedDocumentBytes } from "./whatsapp-media-crypto.ts";

async function encryptWhatsAppDocument(plainText: string, mediaKeyBytes: Uint8Array) {
  const baseKey = await crypto.subtle.importKey("raw", mediaKeyBytes, "HKDF", false, ["deriveBits"]);
  const derivedBits = await crypto.subtle.deriveBits({
    name: "HKDF",
    hash: "SHA-256",
    salt: new Uint8Array(32),
    info: new TextEncoder().encode("WhatsApp Document Keys"),
  }, baseKey, 112 * 8);
  const derived = new Uint8Array(derivedBits);
  const cipherKey = await crypto.subtle.importKey("raw", derived.slice(16, 48), { name: "AES-CBC" }, false, ["encrypt"]);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-CBC", iv: derived.slice(0, 16) },
    cipherKey,
    new TextEncoder().encode(plainText),
  ));
  const withMac = new Uint8Array(encrypted.length + 10);
  withMac.set(encrypted);
  return withMac;
}

describe("download e descriptografia de documentos do WhatsApp", () => {
  it("não confia na extensão Markdown para tratar bytes criptografados como texto", async () => {
    const markdown = "# CONTEXTO DO SEMESTRE\n\nReceita cresceu 12% e a margem estabilizou no segundo trimestre.\n";
    const mediaKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const encrypted = await encryptWhatsAppDocument(markdown, mediaKey);
    expect(looksLikeDecryptedDocumentBytes(encrypted, "contexto.md", "application/octet-stream")).toBe(false);
    const decrypted = await decryptWhatsAppDocument(encrypted, Buffer.from(mediaKey).toString("base64"));
    expect(new TextDecoder().decode(decrypted)).toBe(markdown);
    expect(looksLikeDecryptedDocumentBytes(decrypted, "contexto.md", "application/octet-stream")).toBe(true);
  });

  it("preserva Markdown que já chegou descriptografado", async () => {
    const markdown = "# RELATORIO VALIDO\n\nConteúdo em UTF-8 já liberado pela Evolution.";
    const bytes = new TextEncoder().encode(markdown);
    expect(looksLikeDecryptedDocumentBytes(bytes, "relatorio.md", "application/octet-stream")).toBe(true);
  });
});
