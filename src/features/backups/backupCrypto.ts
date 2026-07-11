const ENCRYPTED_FORMAT = "oraculo-encrypted-backup";
const PBKDF2_ITERATIONS = 210_000;

interface EncryptedBackupEnvelope {
  format: typeof ENCRYPTED_FORMAT;
  version: 1;
  kdf: {
    name: "PBKDF2";
    hash: "SHA-256";
    iterations: number;
    salt: string;
  };
  cipher: {
    name: "AES-GCM";
    iv: string;
  };
  payload: string;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 32_768));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: toArrayBuffer(salt), iterations },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBackupFile(plainText: string, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, new TextEncoder().encode(plainText)),
  );
  const envelope: EncryptedBackupEnvelope = {
    format: ENCRYPTED_FORMAT,
    version: 1,
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    cipher: { name: "AES-GCM", iv: bytesToBase64(iv) },
    payload: bytesToBase64(encrypted),
  };
  return JSON.stringify(envelope);
}

export async function decryptBackupFile(fileText: string, password: string) {
  let envelope: EncryptedBackupEnvelope;
  try {
    envelope = JSON.parse(fileText) as EncryptedBackupEnvelope;
  } catch {
    throw new Error("Arquivo de backup inválido.");
  }
  if (
    envelope.format !== ENCRYPTED_FORMAT ||
    envelope.version !== 1 ||
    envelope.kdf?.name !== "PBKDF2" ||
    envelope.kdf.hash !== "SHA-256" ||
    envelope.cipher?.name !== "AES-GCM"
  ) {
    throw new Error("Formato de backup criptografado não reconhecido.");
  }
  try {
    const salt = base64ToBytes(envelope.kdf.salt);
    const iv = base64ToBytes(envelope.cipher.iv);
    const key = await deriveKey(password, salt, envelope.kdf.iterations);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(base64ToBytes(envelope.payload)),
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error("Senha incorreta ou arquivo corrompido.");
  }
}
