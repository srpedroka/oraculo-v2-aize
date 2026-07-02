export function normalizeWhatsAppNumber(value: string) {
  return value.replace(/\D/g, "");
}

function buildSendUrls(settings: any) {
  const baseUrl = String(settings.instance_url ?? "").replace(/\/+$/, "");
  const instanceName = String(settings.instance_name ?? "").trim();
  if (!baseUrl) return [];

  const urls = [`${baseUrl}/message/sendText/${instanceName}`];
  urls.push(`${baseUrl}/send/text`);
  return [...new Set(urls.filter(Boolean))];
}

export async function sendWhatsAppText(settings: any, keyRow: any, phone: string, text: string) {
  if (!settings?.instance_url || !keyRow?.api_key) throw new Error("WhatsApp não configurado");

  const urls = buildSendUrls(settings);
  if (!urls.length) throw new Error("URL do WhatsApp não configurada");
  const instanceName = String(settings.instance_name ?? "").trim();

  let lastError = "";
  for (const url of urls) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: keyRow.api_key,
      },
      body: JSON.stringify({
        id: instanceName,
        number: normalizeWhatsAppNumber(phone),
        text,
      }),
    });

    if (response.ok) return;

    lastError = await response.text();
    if (![404, 405].includes(response.status)) break;
  }

  throw new Error(`WhatsApp não respondeu corretamente: ${lastError || "erro desconhecido"}`);
}
