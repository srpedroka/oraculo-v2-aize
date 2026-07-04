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

export async function sendWhatsAppText(settings: any, keyRow: any, phone: string, text: string) {
  if (!settings?.instance_url || !keyRow?.api_key) throw new Error("WhatsApp não configurado");

  const urls = buildSendUrls(settings);
  if (!urls.length) throw new Error("URL do WhatsApp não configurada");

  let lastError = "";
  for (const url of urls) {
    const response = await fetch(url, {
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
    });

    if (response.ok) return;

    lastError = await response.text();
    if (![404, 405].includes(response.status)) break;
  }

  throw new Error(`WhatsApp não respondeu corretamente: ${lastError || "erro desconhecido"}`);
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

function splitWhatsAppBlocks(text: string) {
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
  for (const [index, block] of blocks.entries()) {
    if (index > 0) await wait(1000);
    await sendWhatsAppText(settings, keyRow, phone, block);
  }
}
