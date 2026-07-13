export function normalizeWhatsAppNumber(value: string) {
  return value.replace(/\D/g, "");
}

function buildSendUrls(settings: any) {
  const baseUrl = String(settings.instance_url ?? "").replace(/\/+$/, "");
  const instanceName = String(settings.instance_name ?? "").trim();
  if (!baseUrl) return [];

  const urls = [`${baseUrl}/send/text`];
  if (instanceName) urls.push(`${baseUrl}/message/sendText/${instanceName}`);
  return [...new Set(urls.filter(Boolean))];
}

export interface WhatsAppSendReceipt {
  httpStatus: number;
  providerMessageId: string | null;
  providerStatus: string | null;
}

export class WhatsAppSendError extends Error {
  constructor(
    message: string,
    public readonly httpStatus = 0,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "WhatsAppSendError";
  }
}

function safeProviderText(value: unknown, limit: number) {
  if (typeof value !== "string") return null;
  const sanitized = value
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\b(?:Bearer|apikey|token)\s*[:=]?\s*\S+/gi, "[credencial]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
  return sanitized ? sanitized.slice(0, limit) : null;
}

function retryAfterSeconds(response: Response) {
  const raw = response.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(3600, Math.floor(seconds)));
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, Math.min(3600, Math.ceil((at - Date.now()) / 1000))) : null;
}

async function parseSendResponse(response: Response) {
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  const providerMessageId = safeProviderText(
    body?.key?.id ?? body?.messageId ?? body?.id ?? body?.data?.key?.id,
    200,
  );
  const providerStatus = safeProviderText(body?.status ?? body?.message?.status ?? body?.data?.status, 80);
  const providerError = safeProviderText(
    typeof body?.error === "string" ? body.error : body?.message ?? body?.error?.message,
    300,
  );
  return { providerMessageId, providerStatus, providerError };
}

export async function sendWhatsAppText(settings: any, keyRow: any, phone: string, text: string) {
  if (!settings?.instance_url || !keyRow?.api_key) throw new WhatsAppSendError("WhatsApp não configurado", 404);

  const urls = buildSendUrls(settings);
  if (!urls.length) throw new WhatsAppSendError("URL do WhatsApp não configurada", 404);

  for (const url of urls) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: keyRow.api_key,
        },
        body: JSON.stringify({
          number: normalizeWhatsAppNumber(phone),
          text,
          formatJid: true,
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      throw new WhatsAppSendError(timedOut ? "Timeout ao enviar WhatsApp" : "Evolution indisponível");
    }

    const parsed = await parseSendResponse(response);
    if (response.ok) {
      return {
        httpStatus: response.status,
        providerMessageId: parsed.providerMessageId,
        providerStatus: parsed.providerStatus,
      } satisfies WhatsAppSendReceipt;
    }

    if ([404, 405].includes(response.status) && url !== urls[urls.length - 1]) continue;
    throw new WhatsAppSendError(
      `WhatsApp não respondeu corretamente (HTTP ${response.status})${parsed.providerError ? `: ${parsed.providerError}` : ""}`,
      response.status,
      retryAfterSeconds(response),
    );
  }

  throw new WhatsAppSendError("WhatsApp não respondeu corretamente", 502);
}

export function formatForWhatsApp(text: string) {
  const lines = String(text ?? "").split("\n");
  const formatted = lines
    .map((line) => {
      const trimmed = line.trim();
      if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)) return "";
      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        const cells = trimmed
          .split("|")
          .map((cell) => cell.trim())
          .filter(Boolean);
        return cells.length ? `- ${cells.join(" - ")}` : "";
      }
      const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
      if (heading) return `*${heading[1].replace(/\*\*/g, "").trim()}*`;
      return line.replace(/\*\*([^*]+)\*\*/g, "*$1*");
    })
    .filter((line, index, all) => line || (all[index - 1] && all[index + 1]))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return formatted || "Não consegui gerar uma resposta agora.";
}

export function splitWhatsAppBlocks(text: string) {
  const blocks = String(text ?? "")
    .split(/\n\s*---\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);
  if (blocks.length <= 3) return blocks;
  return [...blocks.slice(0, 2), blocks.slice(2).join("\n\n")];
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendWhatsAppMessages(settings: any, keyRow: any, phone: string, text: string) {
  const blocks = splitWhatsAppBlocks(text);
  const receipts: WhatsAppSendReceipt[] = [];
  for (const [index, block] of blocks.entries()) {
    if (index > 0) await wait(1000);
    receipts.push(await sendWhatsAppText(settings, keyRow, phone, block));
  }
  return receipts;
}
