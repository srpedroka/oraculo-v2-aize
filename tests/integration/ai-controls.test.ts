import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;
const stagingUrl = process.env.SUPABASE_STAGING_URL ?? "";
const anonKey = process.env.SUPABASE_STAGING_ANON_KEY ?? "";

async function callFunction(token: string, body: Record<string, unknown>) {
  const response = await fetch(`${stagingUrl}/functions/v1/save-ai-control-policy`, {
    method: "POST",
    headers: { apikey: anonKey, authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() as Record<string, unknown> };
}

d("Fatia 2E — limites e orçamento de IA", () => {
  let org: DisposableOrg | null = null;
  let ownerToken = "";

  beforeAll(async () => {
    org = await createDisposableOrg("2e-ai-controls");
    const owner = anonClient();
    const signIn = await owner.auth.signInWithPassword({ email: org.owner.email, password: org.owner.password });
    if (signIn.error || !signIn.data.session) throw signIn.error ?? new Error("sessão owner ausente");
    ownerToken = signIn.data.session.access_token;
  }, 60_000);

  afterAll(async () => {
    if (org) await destroyDisposableOrg(org);
    org = null;
  }, 60_000);

  it("salva defaults em observação e impede escrita direta", async () => {
    const result = await callFunction(ownerToken, {
      orgId: org!.orgId,
      personCallsPerMinute: 10,
      orgCallsPerMinute: 60,
      monthlyBudgetUsd: 100,
      enforcementMode: "monitor",
    });
    expect(result.response.status).toBe(200);
    expect((result.body.policy as any).enforcement_mode).toBe("monitor");

    const owner = anonClient();
    await owner.auth.signInWithPassword({ email: org!.owner.email, password: org!.owner.password });
    const direct = await owner.from("ai_control_policies").update({ enforcement_mode: "block" }).eq("org_id", org!.orgId);
    expect(direct.error).not.toBeNull();
  });

  it("modo monitor registra rajada por pessoa e continua liberando", async () => {
    const admin = serviceClient();
    const results = [];
    for (let index = 0; index < 12; index += 1) {
      results.push(await admin.rpc("evaluate_ai_call_controls", {
        p_org_id: org!.orgId,
        p_user_id: org!.owner.id,
        p_allow_completion: false,
      }));
    }
    expect(results.every((result) => result.error == null && result.data.allowed === true)).toBe(true);
    expect(results.at(-1)?.data.mode).toBe("monitor");
    expect(results.at(-1)?.data.personCount).toBe(12);

    const event = await admin.from("ai_limit_events").select("kind, blocked").eq("org_id", org!.orgId).eq("kind", "person_rate").single();
    expect(event.error).toBeNull();
    expect(event.data).toMatchObject({ kind: "person_rate", blocked: false });
  });

  it("contador da empresa é atômico sob concorrência", async () => {
    const admin = serviceClient();
    await admin.from("ai_call_counters").delete().eq("org_id", org!.orgId);
    await admin.from("ai_control_policies").update({ org_calls_per_minute: 5, person_calls_per_minute: 300 }).eq("org_id", org!.orgId);
    const calls = await Promise.all(Array.from({ length: 12 }, () => admin.rpc("evaluate_ai_call_controls", {
      p_org_id: org!.orgId,
      p_user_id: null,
      p_allow_completion: false,
    })));
    expect(calls.every((result) => result.error == null && result.data.allowed === true)).toBe(true);
    const counter = await admin.from("ai_call_counters").select("call_count").eq("org_id", org!.orgId).eq("scope", "org").single();
    expect(counter.data?.call_count).toBe(12);
  });

  it("modo block recusa excesso, mas libera conclusão em andamento", async () => {
    const admin = serviceClient();
    await admin.from("ai_call_counters").delete().eq("org_id", org!.orgId);
    await admin.from("ai_control_policies").update({ enforcement_mode: "block", org_calls_per_minute: 2, person_calls_per_minute: 300 }).eq("org_id", org!.orgId);
    const first = await admin.rpc("evaluate_ai_call_controls", { p_org_id: org!.orgId, p_user_id: null, p_allow_completion: false });
    const second = await admin.rpc("evaluate_ai_call_controls", { p_org_id: org!.orgId, p_user_id: null, p_allow_completion: false });
    const third = await admin.rpc("evaluate_ai_call_controls", { p_org_id: org!.orgId, p_user_id: null, p_allow_completion: false });
    const completion = await admin.rpc("evaluate_ai_call_controls", { p_org_id: org!.orgId, p_user_id: null, p_allow_completion: true });
    expect(first.data.allowed).toBe(true);
    expect(second.data.allowed).toBe(true);
    expect(third.data.allowed).toBe(false);
    expect(completion.data.allowed).toBe(true);
    expect(completion.data.completionBypass).toBe(true);
  });

  it("deduplica alertas mensais em 70%, 90% e 100%", async () => {
    const admin = serviceClient();
    await admin.from("ai_call_counters").delete().eq("org_id", org!.orgId);
    await admin.from("ai_control_policies").update({ enforcement_mode: "monitor", org_calls_per_minute: 3000, monthly_budget_usd: 100 }).eq("org_id", org!.orgId);
    const usage = {
      org_id: org!.orgId,
      provider: "openai",
      model: "e2e-budget",
      channel: "system",
      total_cost_usd: 105,
      total_tokens: 1,
    };
    const inserted = await admin.from("ai_usage_logs").insert(usage);
    expect(inserted.error).toBeNull();
    const refreshed = await admin.rpc("refresh_ai_budget_events", { p_org_id: org!.orgId });
    expect(refreshed.error).toBeNull();
    await admin.rpc("refresh_ai_budget_events", { p_org_id: org!.orgId });
    const events = await admin.from("ai_limit_events").select("threshold_percent").eq("org_id", org!.orgId).eq("kind", "monthly_budget").order("threshold_percent");
    expect(events.data?.map((event) => event.threshold_percent)).toEqual([70, 90, 100]);
  });

  it("owner lê alertas e coordenador não acessa o histórico de custo", async () => {
    const owner = anonClient();
    await owner.auth.signInWithPassword({ email: org!.owner.email, password: org!.owner.password });
    const ownerEvents = await owner.from("ai_limit_events").select("id").eq("org_id", org!.orgId);
    expect(ownerEvents.error).toBeNull();
    expect((ownerEvents.data?.length ?? 0) > 0).toBe(true);

    const coordinator = anonClient();
    await coordinator.auth.signInWithPassword({ email: org!.coordinator.email, password: org!.coordinator.password });
    const hidden = await coordinator.from("ai_limit_events").select("id").eq("org_id", org!.orgId);
    expect(hidden.error).toBeNull();
    expect(hidden.data).toEqual([]);
  });
});
