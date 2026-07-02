import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callModel, type Provider } from "../_shared/model.ts";
import { sendWhatsAppText } from "../_shared/whatsapp.ts";

async function readGuide() {
  return await Deno.readTextFile(new URL("../_shared/oraculo-roteiro-estrategico.md", import.meta.url));
}

function normalizePhone(value: unknown) {
  const raw = String(value ?? "").split("@")[0];
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 8 ? `+${digits}` : null;
}

function extractText(payload: any) {
  const data = payload?.data ?? payload;
  return (
    data?.message?.conversation ??
    data?.message?.extendedTextMessage?.text ??
    data?.message?.text ??
    data?.text ??
    payload?.message?.text ??
    payload?.message ??
    ""
  ).toString().trim();
}

function extractRemote(payload: any) {
  const data = payload?.data ?? payload;
  return (
    data?.key?.remoteJid ??
    data?.remoteJid ??
    data?.from ??
    data?.sender ??
    payload?.sender ??
    payload?.from ??
    payload?.phone ??
    ""
  );
}

function extractInstanceName(payload: any) {
  return String(payload?.instance ?? payload?.instanceName ?? payload?.data?.instance ?? "").trim();
}

function fallbackReview(objectives: any[]) {
  const risk = objectives.filter((objective) => ["at_risk", "late"].includes(objective.status));
  if (!objectives.length) return "Ainda não encontrei objetivos no Oráculo. Abra o sistema e crie o primeiro plano para eu acompanhar por aqui.";
  if (risk.length) return `Eu olharia primeiro para ${risk[0].title}. Qual evidência prova avanço real hoje?`;
  return "O plano não tem ponto crítico aparente agora. Registre uma evidência nova para manter a execução rastreável.";
}

async function buildAnswer(client: ReturnType<typeof serviceClient>, orgId: string, areaId: string | null, message: string) {
  const [{ data: settings }, { data: keyRow }, { data: objectives }, { data: areas }, { data: strategicPlan }, { data: areaPlans }, { data: history }] =
    await Promise.all([
      client.from("ai_settings").select("*").eq("org_id", orgId).maybeSingle(),
      client.schema("private").from("ai_model_keys").select("*").eq("org_id", orgId).maybeSingle(),
      client.from("objectives").select("*").eq("org_id", orgId).order("created_at"),
      client.from("areas").select("*").eq("org_id", orgId).order("created_at"),
      client.from("strategic_plans").select("*").eq("org_id", orgId).order("year", { ascending: false }).limit(1).maybeSingle(),
      client.from("area_plans").select("*").eq("org_id", orgId),
      client.from("chat_messages").select("author, text").eq("org_id", orgId).order("created_at", { ascending: false }).limit(20),
    ]);

  if (!settings?.has_key || !keyRow?.api_key) return fallbackReview(objectives ?? []);

  const guide = await readGuide();
  const systemPrompt = [
    "Você é o Oráculo, a IA estratégica da empresa. Responda em português do Brasil.",
    "Você está conversando por WhatsApp: seja curto, direto e cobre evidência.",
    "Nunca diga que salvou algo se a ação não foi gravada pelo sistema.",
    guide,
    "Contexto atual do plano:",
    JSON.stringify({ strategicPlan, areaPlans, areas, objectives, areaId }, null, 2),
  ].join("\n\n");

  const modelMessages = [
    ...(history ?? [])
      .reverse()
      .map((item: { author: "oracle" | "user"; text: string }) => ({
        role: item.author === "oracle" ? "assistant" as const : "user" as const,
        content: item.text,
      })),
    { role: "user" as const, content: message },
  ];

  return await callModel(settings.provider as Provider, settings.model, keyRow.api_key, systemPrompt, modelMessages);
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
      .schema("private")
      .from("whatsapp_instance_keys")
      .select("*")
      .eq("org_id", whatsappSettings.org_id)
      .maybeSingle();
    if (whatsappKeyError) throw whatsappKeyError;

    const receivedSecret = req.headers.get("x-oraculo-webhook-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!whatsappKeyRow?.webhook_secret || receivedSecret !== whatsappKeyRow.webhook_secret) {
      return jsonResponse({ error: "Webhook não autorizado" }, 401);
    }

    const text = extractText(payload);
    const phone = normalizePhone(extractRemote(payload));
    if (!text || !phone) return jsonResponse({ ok: true, ignored: true });

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

    await client.from("chat_messages").insert({
      org_id: orgId,
      area_id: areaId,
      author: "user",
      text,
      channel: "whatsapp",
    });

    const answer = await buildAnswer(client, orgId, areaId, text);

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
