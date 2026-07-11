import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertOwner, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { sendWhatsAppText } from "../_shared/whatsapp.ts";

function cleanRedirectTo(value: unknown) {
  const fallback = Deno.env.get("APP_ORIGIN") ?? "https://oraculo-v2-aize.netlify.app";
  const candidate = String(value ?? fallback).trim() || fallback;
  const url = new URL(candidate);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("URL de convite inválida");
  return url.origin;
}

function firstName(fullName: string) {
  const token = fullName.trim().split(/\s+/).filter(Boolean)[0];
  return token || "olá";
}

function buildInviteMessage(params: { organizationName: string; fullName: string; link: string }) {
  const name = firstName(params.fullName);
  const company = params.organizationName || "sua empresa";
  return [
    `Oi, ${name}.`,
    "",
    `Seu acesso ao Oráculo da ${company} está pronto.`,
    "Abra o app pelo link abaixo — é pessoal, não encaminhe:",
    params.link,
  ].join("\n");
}

async function getWhatsAppConfig(client: ReturnType<typeof serviceClient>, orgId: string) {
  const { data: settings, error: settingsError } = await client
    .from("whatsapp_settings")
    .select("*")
    .eq("org_id", orgId)
    .eq("enabled", true)
    .maybeSingle();
  if (settingsError) throw settingsError;
  if (!settings) return null;

  const { data: keyRow, error: keyError } = await client
    .from("whatsapp_instance_keys")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  if (keyError) throw keyError;
  if (!keyRow?.api_key) return null;

  return { settings, keyRow };
}

// Cria o usuário (se novo) e devolve o link de acesso SEM enviar nada.
// Se o usuário já existe (reenvio), cai para um magic link de acesso.
async function generateInviteLink(
  client: ReturnType<typeof serviceClient>,
  email: string,
  inviteData: Record<string, unknown>,
  redirectTo: string,
) {
  const invite = await client.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: inviteData, redirectTo },
  });
  if (!invite.error && invite.data?.properties?.action_link) return invite.data;

  const magic = await client.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  if (magic.error) throw magic.error;
  return magic.data;
}

async function saveMembership(params: {
  client: ReturnType<typeof serviceClient>;
  orgId: string;
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  areaId: string | null;
}) {
  // Nunca apagar celular existente: só grava phone se veio valor novo.
  const { data: existingProfile, error: existingProfileError } = await params.client
    .from("profiles")
    .select("phone")
    .eq("id", params.userId)
    .maybeSingle();
  if (existingProfileError) throw existingProfileError;

  const nextPhone = params.phone || existingProfile?.phone || null;

  const profilePayload: Record<string, unknown> = {
    id: params.userId,
    full_name: params.fullName || params.email,
    email: params.email,
  };
  if (nextPhone) profilePayload.phone = nextPhone;

  const { error: profileError } = await params.client.from("profiles").upsert(profilePayload);
  if (profileError) throw profileError;

  const { data: membership, error: membershipError } = await params.client
    .from("memberships")
    .upsert({ org_id: params.orgId, user_id: params.userId, role: params.role }, { onConflict: "org_id,user_id" })
    .select("id")
    .single();

  if (membershipError) throw membershipError;

  if (params.areaId) {
    const { data, error } = await params.client.rpc("set_member_primary_area", {
      p_org_id: params.orgId,
      p_membership_id: membership.id,
      p_area_id: params.areaId,
    });
    if (error) throw error;
    void data;
  }

  return membership;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const user = await getUser(req);
    const {
      orgId,
      email,
      fullName,
      phone = null,
      role = "coordinator",
      areaId = null,
      redirectTo = null,
      notify = true,
    } = await req.json();
    if (!orgId || !email) return jsonResponse({ error: "Empresa e email são obrigatórios" }, 400);
    if (phone && !/^\+[1-9][0-9]{7,14}$/.test(phone)) {
      return jsonResponse({ error: "Celular deve estar no formato internacional, por exemplo +5546999990000" }, 400);
    }

    await assertOwner(user.id, orgId);
    const client = serviceClient();
    const cleanFullName = String(fullName || email).trim();
    const cleanPhone = phone ? String(phone).trim() : null;
    const cleanEmail = String(email).trim().toLowerCase();
    const inviteData = { full_name: cleanFullName, phone: cleanPhone || undefined };
    const cleanRedirect = cleanRedirectTo(redirectTo);
    const [{ data: organization, error: organizationError }, whatsappConfig] = await Promise.all([
      client.from("organizations").select("name").eq("id", orgId).maybeSingle(),
      getWhatsAppConfig(client, orgId),
    ]);
    if (organizationError) throw organizationError;

    // Sempre garante usuário + membership + perfil (idempotente).
    const linkData = await generateInviteLink(client, cleanEmail, inviteData, cleanRedirect);
    const invitedUser = linkData.user;
    const inviteLink = linkData.properties?.action_link ?? null;
    if (!invitedUser) throw new Error("Não foi possível criar ou localizar o acesso");

    await saveMembership({
      client,
      orgId,
      userId: invitedUser.id,
      email: cleanEmail,
      fullName: cleanFullName,
      phone: cleanPhone,
      role,
      areaId,
    });

    // Cadastro silencioso: não envia mensagem.
    if (!notify) {
      return jsonResponse({ ok: true, channel: "none" });
    }

    // Convite somente por WhatsApp (decisão do dono).
    if (!cleanPhone) {
      throw new Error("Cadastre o celular para convidar pelo WhatsApp");
    }
    if (!whatsappConfig) {
      throw new Error("Ative o WhatsApp da empresa para convidar");
    }
    if (!inviteLink) {
      throw new Error("Não foi possível gerar o link pessoal de acesso");
    }

    await sendWhatsAppText(
      whatsappConfig.settings,
      whatsappConfig.keyRow,
      cleanPhone,
      buildInviteMessage({
        organizationName: organization?.name ?? "sua empresa",
        fullName: cleanFullName,
        link: inviteLink,
      }),
    );

    return jsonResponse({ ok: true, channel: "whatsapp" });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro ao convidar pessoa" }, 400);
  }
});
