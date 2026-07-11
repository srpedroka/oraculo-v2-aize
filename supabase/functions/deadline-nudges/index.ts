import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { sendWhatsAppMessages } from "../_shared/whatsapp.ts";

type Client = ReturnType<typeof serviceClient>;

function timingSafeEqual(a: string, b: string) {
  const encoder = new TextEncoder();
  const bufferA = encoder.encode(a);
  const bufferB = encoder.encode(b);
  let mismatch = bufferA.length ^ bufferB.length;
  const length = Math.max(bufferA.length, bufferB.length);
  for (let i = 0; i < length; i += 1) {
    mismatch |= (bufferA[i] ?? 0) ^ (bufferB[i] ?? 0);
  }
  return mismatch === 0;
}

async function assertCronSecret(req: Request, client: Client) {
  const received = req.headers.get("x-oraculo-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const { data, error } = await client.from("deadline_nudge_secrets").select("cron_secret").eq("id", "cron").maybeSingle();
  if (error || !data?.cron_secret) throw new Error("Segredo do cron indisponível");
  if (!received || !timingSafeEqual(received, data.cron_secret)) throw new Error("Chamada de cron não autorizada");
}

// Data de referência (só o dia) no fuso de São Paulo.
function todayKeySaoPaulo(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function parseDeadlineKey(deadline: string | null | undefined): string | null {
  if (!deadline) return null;
  const iso = deadline.includes("T") ? deadline : `${deadline}T00:00:00`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return deadline.slice(0, 10);
}

function normalizeName(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function whatsappConfig(client: Client, orgId: string) {
  const { data: settings } = await client.from("whatsapp_settings").select("*").eq("org_id", orgId).eq("enabled", true).maybeSingle();
  if (!settings) return null;
  const { data: keyRow } = await client.from("whatsapp_instance_keys").select("*").eq("org_id", orgId).maybeSingle();
  if (!keyRow?.api_key) return null;
  return { settings, keyRow };
}

interface DueItem {
  title: string;
  deadlineKey: string;
  overdue: boolean;
  membershipId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const client = serviceClient();
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;
    await assertCronSecret(req, client);

    const todayKey = todayKeySaoPaulo();
    // Janela: vencidos + o que vence hoje/amanhã.
    const tomorrow = new Date(`${todayKey}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowKey = tomorrow.toISOString().slice(0, 10);

    const { data: orgs, error: orgError } = await client.from("organizations").select("id, name").is("archived_at", null);
    if (orgError) throw orgError;

    const summary: Array<Record<string, unknown>> = [];

    for (const org of orgs ?? []) {
      const config = await whatsappConfig(client, org.id);
      if (!config && !dryRun) continue;

      const { data: memberships } = await client.from("memberships").select("id, user_id").eq("org_id", org.id);
      const profileIds = [...new Set((memberships ?? []).map((m: any) => m.user_id).filter(Boolean))];
      const { data: profiles } = profileIds.length
        ? await client.from("profiles").select("id, full_name, phone").in("id", profileIds)
        : { data: [] as any[] };

      // membershipId -> { phone, name }
      const memberInfo = new Map<string, { phone: string; name: string }>();
      // texto (nome/email normalizado) -> membershipId, para casar donos escritos à mão
      const nameToMembership = new Map<string, string>();
      for (const membership of memberships ?? []) {
        const profile = (profiles ?? []).find((p: any) => p.id === membership.user_id);
        const phone = String(profile?.phone ?? "").trim();
        const name = String(profile?.full_name ?? "").trim();
        memberInfo.set(membership.id, { phone, name });
        if (name) nameToMembership.set(normalizeName(name), membership.id);
      }

      const [{ data: objectives }, { data: keyActions }] = await Promise.all([
        client.from("objectives").select("id, title, deadline, status, owner, owner_membership_id").eq("org_id", org.id).is("archived_at", null),
        client.from("key_actions").select("id, description, deadline, status, owner, owner_membership_id").eq("org_id", org.id).is("archived_at", null),
      ]);

      const rawItems = [
        ...(objectives ?? []).map((row: any) => ({ title: row.title, deadline: row.deadline, status: row.status, owner: row.owner, ownerMembershipId: row.owner_membership_id })),
        ...(keyActions ?? []).map((row: any) => ({ title: row.description, deadline: row.deadline, status: row.status, owner: row.owner, ownerMembershipId: row.owner_membership_id })),
      ];

      // membershipId -> DueItem[]
      const byMember = new Map<string, DueItem[]>();
      for (const item of rawItems) {
        if (item.status === "done") continue;
        const deadlineKey = parseDeadlineKey(item.deadline);
        if (!deadlineKey || deadlineKey > tomorrowKey) continue; // só vencidos ou vencendo até amanhã

        const membershipId = item.ownerMembershipId ?? nameToMembership.get(normalizeName(item.owner)) ?? null;
        if (!membershipId) continue;
        const info = memberInfo.get(membershipId);
        if (!info || !info.phone) continue; // sem telefone, não há como avisar

        const list = byMember.get(membershipId) ?? [];
        list.push({ title: String(item.title ?? "Compromisso"), deadlineKey, overdue: deadlineKey < todayKey, membershipId });
        byMember.set(membershipId, list);
      }

      for (const [membershipId, items] of byMember) {
        const info = memberInfo.get(membershipId)!;

        if (!dryRun) {
          const { data: already } = await client
            .from("deadline_nudge_log")
            .select("membership_id")
            .eq("org_id", org.id)
            .eq("membership_id", membershipId)
            .eq("sent_on", todayKey)
            .maybeSingle();
          if (already) continue; // já avisado hoje
        }

        const overdueCount = items.filter((item) => item.overdue).length;
        const lines = items
          .sort((left, right) => left.deadlineKey.localeCompare(right.deadlineKey))
          .slice(0, 8)
          .map((item) => `• ${item.title} — ${item.overdue ? "atrasado" : "vence"} (${item.deadlineKey})`);
        const message = [
          "*Oráculo · seus compromissos*",
          `Olá${info.name ? `, ${info.name.split(" ")[0]}` : ""}. Você tem ${items.length} item(ns) ${overdueCount ? "atrasados ou " : ""}vencendo:`,
          ...lines,
          items.length > 8 ? `…e mais ${items.length - 8}.` : "",
          "Quando quiser, atualize o status direto por aqui ou no painel de execução.",
        ].filter(Boolean).join("\n");

        summary.push({ org: org.name, member: info.name || membershipId, items: items.length, overdue: overdueCount, phone: dryRun ? info.phone : undefined });

        if (!dryRun && config) {
          try {
            await sendWhatsAppMessages(config.settings, config.keyRow, info.phone, message);
            await client.from("deadline_nudge_log").insert({ org_id: org.id, membership_id: membershipId, sent_on: todayKey, item_count: items.length });
          } catch (sendError) {
            console.error("deadline-nudges: falha ao enviar", org.name, sendError);
          }
        }
      }
    }

    return jsonResponse({ ok: true, dryRun, notified: summary.length, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no lembrete de prazos";
    const status = /autoriz|Segredo/.test(message) ? 401 : 400;
    return jsonResponse({ error: message }, status);
  }
});
