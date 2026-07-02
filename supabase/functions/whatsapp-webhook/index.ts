import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callModel, type Provider } from "../_shared/model.ts";
import { CONVERSATION_STYLE, STRATEGIC_GUIDE } from "../_shared/prompt-guides.ts";
import { decodeBase64Audio, transcribeAudioWithOpenAi, type AudioFile } from "../_shared/transcription.ts";
import { recordAiUsage } from "../_shared/usage.ts";
import { sendWhatsAppText } from "../_shared/whatsapp.ts";

function normalizePhone(value: unknown) {
  const source = String(value ?? "").trim();
  if (!source || source.includes("@lid")) return null;

  const raw = source.split("@")[0];
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 8 ? `+${digits}` : null;
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

async function downloadAudioFromUrl(url: string, keyRow: any, mimeType: string): Promise<AudioFile | null> {
  if (!url.startsWith("http")) return null;
  const response = await fetch(url, {
    headers: keyRow?.api_key ? { apikey: keyRow.api_key } : undefined,
  }).catch(() => null);
  if (!response?.ok) return null;

  const contentType = response.headers.get("content-type") ?? mimeType;
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    bytes,
    mimeType: contentType || mimeType,
    fileName: contentType.includes("mpeg") ? "whatsapp-audio.mp3" : "whatsapp-audio.ogg",
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

async function audioFileFromMediaResponse(response: Response, mimeType: string) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json") || contentType.includes("text/")) {
    const payload = contentType.includes("application/json") ? await response.json().catch(() => null) : null;
    const base64 = extractBase64FromMediaResponse(payload);
    if (base64) return audioFileFromBase64(base64, mimeType);

    const text = payload ? "" : await response.text().catch(() => "");
    const textBase64 = firstText(text);
    if (textBase64 && /^[A-Za-z0-9+/=\s]+$/.test(textBase64) && textBase64.length > 120) {
      return audioFileFromBase64(textBase64, mimeType);
    }
    return null;
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) return null;

  return {
    bytes,
    mimeType: contentType || mimeType,
    fileName: contentType.includes("mpeg") ? "whatsapp-audio.mp3" : "whatsapp-audio.ogg",
  };
}

async function downloadAudioFromEvolution(settings: any, keyRow: any, audioInfo: NonNullable<ReturnType<typeof extractAudioInfo>>) {
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
          const errorText = await response.text().catch(() => "");
          console.error("Evolution não retornou mídia", response.status, endpoint, errorText.slice(0, 180));
        }
        continue;
      }
      const file = await audioFileFromMediaResponse(response, audioInfo.mimeType);
      if (file) return file;
      console.error("Evolution retornou mídia sem base64 reconhecido", endpoint);
    }
  }

  return null;
}

async function resolveAudioFile(settings: any, keyRow: any, payload: any) {
  const audioInfo = extractAudioInfo(payload);
  if (!audioInfo) return null;

  if (audioInfo.base64) {
    const file = audioFileFromBase64(audioInfo.base64, audioInfo.mimeType);
    if (file) return file;
  }

  if (audioInfo.url) {
    const file = await downloadAudioFromUrl(audioInfo.url, keyRow, audioInfo.mimeType);
    if (file) return file;
  }

  return await downloadAudioFromEvolution(settings, keyRow, audioInfo);
}

async function transcribeIncomingAudio(client: ReturnType<typeof serviceClient>, orgId: string, whatsappSettings: any, whatsappKeyRow: any, payload: any) {
  const audioFile = await resolveAudioFile(whatsappSettings, whatsappKeyRow, payload);
  if (!audioFile) return "";

  const [{ data: settings }, { data: keyRow }] = await Promise.all([
    client.from("ai_settings").select("*").eq("org_id", orgId).maybeSingle(),
    client.from("ai_model_keys").select("*").eq("org_id", orgId).maybeSingle(),
  ]);

  if (settings?.provider !== "openai" || keyRow?.provider !== "openai" || !keyRow?.api_key) {
    throw new Error("Transcrição de áudio exige uma chave OpenAI ativa.");
  }

  const result = await transcribeAudioWithOpenAi(keyRow.api_key, audioFile);
  return result.text;
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
  const [
    { data: settings },
    { data: keyRow },
    { data: organization },
    { data: objectives },
    { data: areas },
    { data: strategicPlan },
    { data: areaPlans },
    { data: history },
  ] =
    await Promise.all([
      client.from("ai_settings").select("*").eq("org_id", orgId).maybeSingle(),
      client.from("ai_model_keys").select("*").eq("org_id", orgId).maybeSingle(),
      client.from("organizations").select("name, subtitle").eq("id", orgId).maybeSingle(),
      client.from("objectives").select("*").eq("org_id", orgId).order("created_at"),
      client.from("areas").select("*").eq("org_id", orgId).order("created_at"),
      client.from("strategic_plans").select("*").eq("org_id", orgId).order("year", { ascending: false }).limit(1).maybeSingle(),
      client.from("area_plans").select("*").eq("org_id", orgId),
      client.from("chat_messages").select("id, author, text").eq("org_id", orgId).order("created_at", { ascending: false }).limit(20),
    ]);

  const currentArea = (areas ?? []).find((area: any) => area.id === areaId) ?? null;

  if (!settings?.has_key || !keyRow?.api_key) {
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
    const result = await callModel(settings.provider as Provider, settings.model, keyRow.api_key, systemPrompt, modelMessages);
    await recordAiUsage({
      client,
      orgId,
      provider: settings.provider as Provider,
      model: settings.model,
      channel: "whatsapp",
      usage: result.usage,
      settings,
      metadata: { areaId, phone: profile?.phone ?? null },
    });
    return result.text;
  } catch (_error) {
    console.error("Erro ao chamar IA no WhatsApp", _error instanceof Error ? _error.message : String(_error));
    return contextualFallback(profile, organization, objectives ?? [], message);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
    const phone = normalizePhone(extractRemote(payload));
    if ((!extractedText && !hasAudio) || !phone) return jsonResponse({ ok: true, ignored: true });

    const orgId = whatsappSettings.org_id as string;
    const { data: profile } = await client.from("profiles").select("id, full_name, phone").eq("phone", phone).maybeSingle();
    if (!profile) {
      await sendWhatsAppText(whatsappSettings, whatsappKeyRow, phone, "Este número não está cadastrado no Oráculo. Peça ao dono da empresa para vincular seu celular.");
      return jsonResponse({ ok: true, rejected: "unknown_phone" });
    }

    const { data: membership } = await client
      .from("memberships")
      .select("id, role")
      .eq("org_id", orgId)
      .eq("user_id", profile.id)
      .maybeSingle();
    if (!membership) {
      await sendWhatsAppText(whatsappSettings, whatsappKeyRow, phone, "Seu número existe, mas não tem acesso a esta empresa no Oráculo.");
      return jsonResponse({ ok: true, rejected: "no_membership" });
    }

    const { data: area } = await client.from("areas").select("id").eq("org_id", orgId).eq("coordinator_id", membership.id).maybeSingle();
    const areaId = area?.id ?? null;
    let text = extractedText;
    let wasTranscribedAudio = false;

    if (!text && hasAudio) {
      try {
        text = await transcribeIncomingAudio(client, orgId, whatsappSettings, whatsappKeyRow, payload);
        wasTranscribedAudio = Boolean(text);
      } catch (error) {
        console.error("Erro ao transcrever áudio do WhatsApp", error instanceof Error ? error.message : String(error));
      }
    }

    if (!text) {
      const audioFailureText = "[Áudio recebido sem transcrição]";
      const answer = "Recebi seu áudio, mas ainda não consegui transcrever por aqui. Pode me mandar em texto por enquanto?";

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

      await sendWhatsAppText(whatsappSettings, whatsappKeyRow, phone, answer);
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

    await sendWhatsAppText(whatsappSettings, whatsappKeyRow, phone, answer);
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro no webhook do WhatsApp" }, 400);
  }
});
