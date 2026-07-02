export interface AudioFile {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
}

export interface TranscriptionResult {
  text: string;
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

export async function transcribeAudioWithOpenAi(apiKey: string, audio: AudioFile): Promise<TranscriptionResult> {
  const formData = new FormData();
  formData.append("model", "gpt-4o-mini-transcribe");
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
    const errorText = await response.text();
    throw new Error(`OpenAI não transcreveu o áudio: ${errorText}`);
  }

  const data = await response.json();
  return { text: String(data.text ?? "").trim() };
}
