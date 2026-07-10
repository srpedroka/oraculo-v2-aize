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

function buildInviteMessage(params: { organizationName: string; fullName: string; link: string }) {
  return [
    `Olá, ${params.fullName}. Você foi convidado para entrar no Oráculo da ${params.organizationName}.`,
    "",
    "Acesse o link abaixo para criar seu acesso e acompanhar os planos da sua área:",
    params.link,
    "",
    "Este convite é pessoal. Não encaminhe para outras pessoas.",
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
  const profilePayload: Record<string, unknown> = {
    id: params.userId,
    full_name: params.fullName || params.email,
    email: params.email,
  };
  if (params.phone) profilePayload.phone = params.phone;

  const { error: profileError } = await params.client.from("profiles").upsert(profilePayload);
  if (profileError) throw profileError;

  const { data: membership, error: membershipError } = await params.client
    .from("memberships")
    .upsert({ org_id: params.orgId, user_id: params.userId, role: params.role }, { onConflict: "org_id,user_id" })
    .select("id")
    .single();

  if (membershipError) throw membershipError;

  if (params.areaId) {
    const { data: area, error: areaError } = await params.client
      .from("areas")
      .update({ coordinator_id: membership.id })
      .eq("id", params.areaId)
      .eq("org_id", params.orgId)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();
    if (areaError) throw areaError;
    if (!area) throw new Error("Área arquivada ou não encontrada");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await getUser(req);
    const { orgId, email, fullName, phone = null, role = "coordinator", areaId = null, redirectTo = null } = await req.json();
    if (!orgId || !email) return jsonResponse({ error: "Empresa e email são obrigatórios" }, 400);
    if (phone && !/^\+[1-9][0-9]{7,14}$/.test(phone)) {
      return jsonResponse({ error: "Celular deve estar no formato internacional, por exemplo +5546999990000" }, 400);
    }

    await assertOwner(user.id, orgId);
    const client = serviceClient();
    const cleanFullName = String(fullName || email).trim();
    const cleanPhone = phone ? String(phone).trim() : null;
    const inviteData = { full_name: cleanFullName, phone: cleanPhone || undefined };
    const cleanRedirect = cleanRedirectTo(redirectTo);
    const [{ data: organization, error: organizationError }, whatsappConfig] = await Promise.all([
      client.from("organizations").select("name").eq("id", orgId).maybeSingle(),
      cleanPhone ? getWhatsAppConfig(client, orgId) : Promise.resolve(null),
    ]);
    if (organizationError) throw organizationError;

    if (cleanPhone && whatsappConfig) {
      const generated = await client.auth.admin.generateLink({
        type: "invite",
        email,
        options: { data: inviteData, redirectTo: cleanRedirect },
      });

      if (generated.error) throw generated.error;
      const invitedUser = generated.data.user;
      const inviteLink = generated.data.properties?.action_link;
      if (!invitedUser || !inviteLink) throw new Error("Link de convite não retornado");

      await saveMembership({
        client,
        orgId,
        userId: invitedUser.id,
        email,
        fullName: cleanFullName,
        phone: cleanPhone,
        role,
        areaId,
      });

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
    }

    const invite = await client.auth.admin.inviteUserByEmail(email, {
      data: inviteData,
      redirectTo: cleanRedirect,
    });

    if (invite.error) throw invite.error;
    const invitedUser = invite.data.user;
    if (!invitedUser) throw new Error("Usuário não retornado pelo convite");

    await saveMembership({
      client,
      orgId,
      userId: invitedUser.id,
      email,
      fullName: cleanFullName,
      phone: cleanPhone,
      role,
      areaId,
    });

    return jsonResponse({ ok: true, channel: "email" });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro ao convidar pessoa" }, 400);
  }
});
