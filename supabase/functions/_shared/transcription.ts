export interface AudioFile {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
}

export interface TranscriptionResult {
  text: string;
}

export class TranscriptionRequestError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(`openai:${status}:${code}`);
    this.status = status;
    this.code = code;
  }
}

function extensionFromMimeType(mimeType: string) {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("webm")) return "webm";
  return "ogg";
}

export function decodeBase64Audio(base64: string, mimeType = "audio/ogg") {
  const cleanBase64 = base64.includes(",") ? base64.split(",").pop() ?? "" : base64;
  const binary = atob(cleanBase64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return {
    bytes,
    mimeType,
    fileName: `whatsapp-audio.${extensionFromMimeType(mimeType)}`,
  };
}

async function callTranscriptionModel(apiKey: string, audio: AudioFile, model: string): Promise<TranscriptionResult> {
  const formData = new FormData();
  formData.append("model", model);
  formData.append("language", "pt");
  formData.append("response_format", "json");
  formData.append("file", new Blob([audio.bytes], { type: audio.mimeType }), audio.fileName);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const code = String(payload?.error?.code ?? payload?.error?.type ?? "request_failed").slice(0, 80);
    throw new TranscriptionRequestError(response.status, code);
  }

  const data = await response.json();
  return { text: String(data.text ?? "").trim() };
}

export async function transcribeAudioWithOpenAi(apiKey: string, audio: AudioFile): Promise<TranscriptionResult> {
  try {
    return await callTranscriptionModel(apiKey, audio, "gpt-4o-mini-transcribe");
  } catch (error) {
    if (error instanceof TranscriptionRequestError && [400, 404].includes(error.status)) {
      return await callTranscriptionModel(apiKey, audio, "whisper-1");
    }
    throw error;
  }
}
