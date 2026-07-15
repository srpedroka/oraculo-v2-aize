import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;
const stagingUrl = process.env.SUPABASE_STAGING_URL ?? "";
const anonKey = process.env.SUPABASE_STAGING_ANON_KEY ?? "";

async function callFunction(slug: string, token: string, requestId: string, body: Record<string, unknown>) {
  const response = await fetch(`${stagingUrl}/functions/v1/${slug}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() as Record<string, unknown> };
}

d("Fatia 6E — auditoria administrativa", () => {
  let org: DisposableOrg | null = null;
  let ownerToken = "";

  beforeAll(async () => {
    org = await createDisposableOrg("6e-admin-audit");
    const owner = anonClient();
    const { data, error } = await owner.auth.signInWithPassword({ email: org.owner.email, password: org.owner.password });
    if (error || !data.session) throw error ?? new Error("Sessão owner não criada");
    ownerToken = data.session.access_token;
  }, 60_000);

  afterAll(async () => {
    if (org) await destroyDisposableOrg(org);
    org = null;
  }, 60_000);

  it("registra pessoas, IA, WhatsApp e backup com request ID e snapshots sanitizados", async () => {
    const role = await callFunction("set-member-role", ownerToken, "audit-role", {
      orgId: org!.orgId,
      membershipId: org!.admin.membershipId,
      role: "coordinator",
    });
    expect(role.response.status, JSON.stringify(role.body)).toBe(200);

    const area = await callFunction("set-member-area", ownerToken, "audit-area", {
      orgId: org!.orgId,
      membershipId: org!.admin.membershipId,
      areaId: org!.areas.comercialId,
    });
    expect(area.response.status, JSON.stringify(area.body)).toBe(200);

    const controls = await callFunction("save-ai-control-policy", ownerToken, "audit-ai-controls", {
      orgId: org!.orgId,
      personCallsPerMinute: 31,
      orgCallsPerMinute: 301,
      monthlyBudgetUsd: 1234,
      enforcementMode: "monitor",
    });
    expect(controls.response.status, JSON.stringify(controls.body)).toBe(200);

    const { data: aiFunction } = await serviceClient()
      .from("ai_function_settings")
      .select("updated_at")
      .eq("org_id", org!.orgId)
      .eq("function", "planning")
      .maybeSingle();
    const ai = await callFunction("save-ai-settings", ownerToken, "audit-ai-model", {
      orgId: org!.orgId,
      function: "planning",
      provider: "openai",
      model: "gpt-5.5",
      validate: false,
      expectedUpdatedAt: aiFunction?.updated_at ?? null,
    });
    expect(ai.response.status, JSON.stringify(ai.body)).toBe(200);

    const { data: whatsappCurrent } = await serviceClient()
      .from("whatsapp_settings")
      .select("updated_at")
      .eq("org_id", org!.orgId)
      .maybeSingle();
    const whatsapp = await callFunction("save-whatsapp-settings", ownerToken, "audit-whatsapp", {
      orgId: org!.orgId,
      enabled: false,
      weeklyPulseEnabled: false,
      expectedUpdatedAt: whatsappCurrent?.updated_at ?? null,
    });
    expect(whatsapp.response.status, JSON.stringify(whatsapp.body)).toBe(200);

    const { data: policy, error: policyError } = await serviceClient()
      .from("organization_backup_policies")
      .select("automatic_enabled,event_snapshots_enabled,event_retention_days,daily_retention_days,weekly_retention_days,monthly_retention_days")
      .eq("org_id", org!.orgId)
      .single();
    if (policyError) throw policyError;
    const backupPolicy = await callFunction("organization-backup", ownerToken, "audit-backup-policy", {
      orgId: org!.orgId,
      action: "update_policy",
      policy: {
        automaticEnabled: policy.automatic_enabled,
        eventSnapshotsEnabled: policy.event_snapshots_enabled,
        eventRetentionDays: policy.event_retention_days,
        dailyRetentionDays: policy.daily_retention_days,
        weeklyRetentionDays: policy.weekly_retention_days,
        monthlyRetentionDays: policy.monthly_retention_days,
      },
    });
    expect(backupPolicy.response.status, JSON.stringify(backupPolicy.body)).toBe(200);

    const requestIds = ["audit-role", "audit-area", "audit-ai-controls", "audit-ai-model", "audit-whatsapp", "audit-backup-policy"];
    const { data: events, error } = await serviceClient()
      .from("administrative_audit_events")
      .select("category,action,before_data,after_data,request_id")
      .eq("org_id", org!.orgId)
      .in("request_id", requestIds);
    expect(error).toBeNull();
    expect(events).toHaveLength(requestIds.length);
    expect(new Set(events?.map((event) => event.action))).toEqual(new Set([
      "member_role_changed",
      "member_area_changed",
      "ai_control_policy_updated",
      "ai_function_updated",
      "whatsapp_settings_updated",
      "backup_policy_updated",
    ]));
    expect(JSON.stringify(events)).not.toMatch(/key_preview|api_key\":\"|webhook_secret\":\"/i);
    expect(events?.find((event) => event.action === "whatsapp_settings_updated")?.after_data).toMatchObject({
      has_api_key: false,
      has_webhook_secret: false,
    });
  }, 60_000);

  it("registra a remoção e preserva o evento depois que a membership deixa de existir", async () => {
    const removed = await callFunction("remove-member", ownerToken, "audit-remove-member", {
      orgId: org!.orgId,
      membershipId: org!.admin.membershipId,
      areaReassignments: { [org!.areas.comercialId]: null },
    });
    expect(removed.response.status, JSON.stringify(removed.body)).toBe(200);

    const { data: event, error } = await serviceClient()
      .from("administrative_audit_events")
      .select("action,target_user_id,before_data,after_data")
      .eq("org_id", org!.orgId)
      .eq("request_id", "audit-remove-member")
      .single();
    expect(error).toBeNull();
    expect(event).toMatchObject({
      action: "member_removed",
      target_user_id: org!.admin.id,
      after_data: { access: "removed" },
    });
    const membership = await serviceClient().from("memberships").select("id").eq("id", org!.admin.membershipId).maybeSingle();
    expect(membership.data).toBeNull();
  });
});
