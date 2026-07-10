import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { previousMonthPeriod, previousQuarterPeriod } from "../_shared/periods.ts";
import { sendWhatsAppMessages } from "../_shared/whatsapp.ts";

type Client = ReturnType<typeof serviceClient>;

// Comparacao em tempo constante para nao vazar o segredo por timing.
function timingSafeEqual(a: string, b: string) {
  const encoder = new TextEncoder();
  const bufferA = encoder.encode(a);
  const bufferB = encoder.encode(b);
  // Compara sempre o mesmo numero de bytes; diferenca de tamanho ja falha, mas sem short-circuit no conteudo.
  let mismatch = bufferA.length ^ bufferB.length;
  const length = Math.max(bufferA.length, bufferB.length);
  for (let i = 0; i < length; i += 1) {
    mismatch |= (bufferA[i] ?? 0) ^ (bufferB[i] ?? 0);
  }
  return mismatch === 0;
}

function assertCronSecret(req: Request) {
  const expected = Deno.env.get("MONTH_TURN_SECRET");
  // Fail-closed: sem segredo configurado, ninguem dispara a virada de mes.
  if (!expected) throw new Error("MONTH_TURN_SECRET não configurado");
  const received = req.headers.get("x-oraculo-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!received || !timingSafeEqual(received, expected)) throw new Error("Segredo do agendamento inválido");
}

async function whatsappConfig(client: Client, orgId: string) {
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

async function recipientPhones(client: Client, orgId: string, coordinatorMembershipId: string | null) {
  const { data: memberships, error } = await client
    .from("memberships")
    .select("id, user_id, role")
    .eq("org_id", orgId);
  if (error) throw error;

  const recipients = (memberships ?? []).filter((membership: any) =>
    membership.role === "owner" || (coordinatorMembershipId && membership.id === coordinatorMembershipId)
  );
  const profileIds = [...new Set(recipients.map((membership: any) => membership.user_id).filter(Boolean))];
  if (!profileIds.length) return [];

  const { data: profiles, error: profileError } = await client
    .from("profiles")
    .select("id, phone")
    .in("id", profileIds);
  if (profileError) throw profileError;

  return [...new Set((profiles ?? []).map((profile: any) => String(profile.phone ?? "").trim()).filter(Boolean))];
}

function turnMessage(params: { period: string; quarterPeriod: string; areaName: string; includeQuarter: boolean }) {
  return [
    "*Virada de mês no Oráculo*",
    `${params.period} fechou para ${params.areaName}.`,
    "Quando quiser, me chama com *fechar o mês* que eu conduzo em 10 minutos: revisamos objetivos, registramos evidências e deixamos o próximo mês encaminhado.",
    params.includeQuarter ? `Como também fechou ${params.quarterPeriod}, depois subimos um andar para o fechamento do trimestre.` : "",
  ].filter(Boolean).join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    assertCronSecret(req);
    const client = serviceClient();
    const period = previousMonthPeriod();
    const quarterPeriod = previousQuarterPeriod();
    const includeQuarter = /^(Mar|Jun|Set|Dez)\s+/i.test(period);
    const { data: orgs, error: orgError } = await client.from("organizations").select("id, name");
    if (orgError) throw orgError;

    let areasChecked = 0;
    let invitationsSent = 0;
    let pendingWithoutWhatsApp = 0;

    for (const org of orgs ?? []) {
      const config = await whatsappConfig(client, org.id);
      const { data: areas, error: areasError } = await client
        .from("areas")
        .select("id, name, coordinator_id")
        .eq("org_id", org.id)
        .is("archived_at", null);
      if (areasError) throw areasError;

      for (const area of areas ?? []) {
        const { data: objectives, error: objectivesError } = await client
          .from("objectives")
          .select("id")
          .eq("org_id", org.id)
          .eq("area_id", area.id)
          .eq("level", "monthly")
          .eq("period", period)
          .is("archived_at", null)
          .limit(1);
        if (objectivesError) throw objectivesError;
        if (!(objectives ?? []).length) continue;

        const { data: checkIn, error: checkInError } = await client
          .from("check_ins")
          .select("id")
          .eq("org_id", org.id)
          .eq("area_id", area.id)
          .eq("period", period)
          .is("archived_at", null)
          .limit(1)
          .maybeSingle();
        if (checkInError) throw checkInError;
        if (checkIn) continue;

        areasChecked += 1;
        if (!config) {
          pendingWithoutWhatsApp += 1;
          continue;
        }

        const phones = await recipientPhones(client, org.id, area.coordinator_id ?? null);
        for (const phone of phones) {
          await sendWhatsAppMessages(config.settings, config.keyRow, phone, turnMessage({
            period,
            quarterPeriod,
            areaName: area.name ?? "área",
            includeQuarter,
          }));
          invitationsSent += 1;
        }
      }
    }

    return jsonResponse({ ok: true, period, quarterPeriod, areasChecked, invitationsSent, pendingWithoutWhatsApp });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro na virada de mês" }, 400);
  }
});
