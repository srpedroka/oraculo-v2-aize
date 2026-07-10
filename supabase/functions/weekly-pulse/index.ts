import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serviceClient } from "../_shared/auth.ts";
import { getOrCreateConversation, insertConversationMessage } from "../_shared/conversations.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { currentMonthPeriod, currentQuarterPeriod } from "../_shared/periods.ts";
import { sendWhatsAppMessages } from "../_shared/whatsapp.ts";

type Client = ReturnType<typeof serviceClient>;

function timingSafeEqual(a: string, b: string) {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return mismatch === 0;
}

async function assertCronSecret(req: Request, client: Client) {
  const received = req.headers.get("x-oraculo-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const { data, error } = await client.from("deadline_nudge_secrets").select("cron_secret").eq("id", "cron").maybeSingle();
  if (error || !data?.cron_secret) throw new Error("Segredo do cron indisponível");
  if (!received || !timingSafeEqual(received, data.cron_secret)) throw new Error("Chamada de cron não autorizada");
}

function saoPauloClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[value("weekday")] ?? 0;
  return { date: `${value("year")}-${value("month")}-${value("day")}`, hour: Number(value("hour")), weekday };
}

function mondayOfWeek(dateKey: string, weekday: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - Math.max(0, weekday - 1));
  return date.toISOString().slice(0, 10);
}

function pulseMessage(seed: string, firstName: string) {
  const variants = [
    `Como foi sua semana por aí${firstName ? `, ${firstName}` : ""}? Teve algum avanço, sucesso ou dificuldade no seu plano que vale compartilhar?`,
    `Fechando a semana${firstName ? `, ${firstName}` : ""}: aconteceu algum avanço importante ou apareceu alguma trava no seu plano?`,
    `Antes da semana acabar${firstName ? `, ${firstName}` : ""}, tem algum progresso, aprendizado ou dificuldade do plano que você queira me contar?`,
  ];
  const score = [...seed].reduce((total, character) => total + character.charCodeAt(0), 0);
  return variants[score % variants.length];
}

async function whatsappConfig(client: Client, orgId: string) {
  const { data: settings } = await client.from("whatsapp_settings").select("*").eq("org_id", orgId).eq("enabled", true).maybeSingle();
  if (!settings) return null;
  const { data: keyRow } = await client.from("whatsapp_instance_keys").select("*").eq("org_id", orgId).maybeSingle();
  if (!keyRow?.api_key) return null;
  return { settings, keyRow };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const client = serviceClient();
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;
    await assertCronSecret(req, client);

    const clock = saoPauloClock();
    const weekStart = mondayOfWeek(clock.date, clock.weekday);
    const { data: settingsRows, error: settingsError } = await client
      .from("whatsapp_settings")
      .select("org_id, weekly_pulse_weekday, weekly_pulse_hour")
      .eq("enabled", true)
      .eq("weekly_pulse_enabled", true)
      .eq("weekly_pulse_weekday", clock.weekday)
      .eq("weekly_pulse_hour", clock.hour);
    if (settingsError) throw settingsError;

    const summary: Array<Record<string, unknown>> = [];
    for (const setting of settingsRows ?? []) {
      const config = await whatsappConfig(client, setting.org_id);
      if (!config && !dryRun) continue;

      const { data: areas, error: areasError } = await client
        .from("areas")
        .select("id, name, coordinator_id")
        .eq("org_id", setting.org_id)
        .not("coordinator_id", "is", null)
        .is("archived_at", null);
      if (areasError) throw areasError;

      const coordinatorIds = [...new Set((areas ?? []).map((area: any) => area.coordinator_id).filter(Boolean))];
      if (!coordinatorIds.length) continue;
      const { data: memberships, error: membershipError } = await client
        .from("memberships")
        .select("id, user_id")
        .eq("org_id", setting.org_id)
        .in("id", coordinatorIds);
      if (membershipError) throw membershipError;

      const userIds = [...new Set((memberships ?? []).map((membership: any) => membership.user_id).filter(Boolean))];
      const { data: profiles, error: profilesError } = userIds.length
        ? await client.from("profiles").select("id, full_name, phone").in("id", userIds)
        : { data: [], error: null };
      if (profilesError) throw profilesError;

      for (const membership of memberships ?? []) {
        const memberAreas = (areas ?? []).filter((area: any) => area.coordinator_id === membership.id);
        const areaIds = memberAreas.map((area: any) => area.id);
        if (!areaIds.length) continue;

        const { data: activePlan, error: planError } = await client
          .from("objectives")
          .select("id")
          .eq("org_id", setting.org_id)
          .in("area_id", areaIds)
          .in("level", ["quarterly", "monthly"])
          .in("period", [currentQuarterPeriod(), currentMonthPeriod()])
          .is("archived_at", null)
          .limit(1);
        if (planError) throw planError;
        if (!(activePlan ?? []).length) continue;

        const { data: activeSession } = await client
          .from("planning_sessions")
          .select("id")
          .eq("org_id", setting.org_id)
          .eq("user_id", membership.user_id)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();
        if (activeSession) continue;

        const profile = (profiles ?? []).find((item: any) => item.id === membership.user_id);
        const phone = String(profile?.phone ?? "").trim();
        if (!phone) continue;

        const { data: already } = await client
          .from("weekly_pulse_log")
          .select("membership_id")
          .eq("org_id", setting.org_id)
          .eq("membership_id", membership.id)
          .eq("week_start", weekStart)
          .maybeSingle();
        if (already) continue;

        const primaryAreaId = areaIds.length === 1 ? areaIds[0] : null;
        const conversation = await getOrCreateConversation(client, {
          orgId: setting.org_id,
          userId: membership.user_id,
          channel: "whatsapp",
          areaId: primaryAreaId,
        });
        const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
        const message = pulseMessage(`${weekStart}:${membership.id}`, String(profile?.full_name ?? "").trim().split(" ")[0]);

        summary.push({ orgId: setting.org_id, membershipId: membership.id, areas: memberAreas.map((area: any) => area.name), phone: dryRun ? phone : undefined });
        if (dryRun || !config) continue;

        await sendWhatsAppMessages(config.settings, config.keyRow, phone, message);
        await insertConversationMessage(client, {
          orgId: setting.org_id,
          areaId: primaryAreaId,
          userId: membership.user_id,
          conversationId: conversation.id,
          author: "oracle",
          text: message,
          channel: "whatsapp",
        });
        await client.from("conversations").update({
          pending_context: { type: "weekly_pulse", weekStart, areaIds, expiresAt },
        }).eq("id", conversation.id);
        await client.from("weekly_pulse_log").insert({
          org_id: setting.org_id,
          membership_id: membership.id,
          week_start: weekStart,
          conversation_id: conversation.id,
        });
      }
    }

    return jsonResponse({ ok: true, dryRun, clock, weekStart, eligible: summary.length, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no pulso semanal";
    const status = /autoriz|Segredo/.test(message) ? 401 : 400;
    return jsonResponse({ error: message }, status);
  }
});
