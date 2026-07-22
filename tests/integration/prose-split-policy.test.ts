import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;
const stagingUrl = process.env.SUPABASE_STAGING_URL ?? "";
const anonKey = process.env.SUPABASE_STAGING_ANON_KEY ?? "";

d("Equilibrio IA F4 - flag e concorrencia", () => {
  let org: DisposableOrg | null = null;
  let ownerToken = "";
  const admin = RUN ? serviceClient() : (null as any);

  beforeAll(async () => {
    org = await createDisposableOrg("prose-split");
    const owner = anonClient();
    const login = await owner.auth.signInWithPassword({ email: org.owner.email, password: org.owner.password });
    if (login.error || !login.data.session) throw login.error ?? new Error("sessao owner ausente");
    ownerToken = login.data.session.access_token;
  }, 60_000);

  afterAll(async () => {
    if (org) await destroyDisposableOrg(org);
    org = null;
  }, 60_000);

  it("mantem a flag desligada por padrao e permite ativacao apenas pelo endpoint owner", async () => {
    const defaults = await admin.from("ai_control_policies").insert({ org_id: org!.orgId }).select("prose_split_enabled").single();
    expect(defaults.error).toBeNull();
    expect(defaults.data?.prose_split_enabled).toBe(false);

    const response = await fetch(`${stagingUrl}/functions/v1/save-ai-control-policy`, {
      method: "POST",
      headers: { apikey: anonKey, authorization: `Bearer ${ownerToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        orgId: org!.orgId,
        personCallsPerMinute: 10,
        orgCallsPerMinute: 60,
        monthlyBudgetUsd: 100,
        enforcementMode: "monitor",
        proseSplitEnabled: true,
      }),
    });
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.policy.prose_split_enabled).toBe(true);

    const owner = anonClient();
    await owner.auth.signInWithPassword({ email: org!.owner.email, password: org!.owner.password });
    const direct = await owner.from("ai_control_policies").update({ prose_split_enabled: false }).eq("org_id", org!.orgId);
    expect(direct.error).not.toBeNull();
  });

  it("concede um unico lease e impede update com revisao antiga", async () => {
    const inserted = await admin.from("planning_sessions").insert({
      org_id: org!.orgId,
      area_id: org!.areas.comercialId,
      user_id: org!.owner.id,
      type: "monthly",
      period: "2026-08",
      phase: "abertura",
      state: { objetivo: "baseline" },
    }).select("*").single();
    expect(inserted.error).toBeNull();

    const tokenA = crypto.randomUUID();
    const tokenB = crypto.randomUUID();
    const claims = await Promise.all([
      admin.rpc("claim_planning_session_turn", {
        p_session_id: inserted.data.id,
        p_user_id: org!.owner.id,
        p_token: tokenA,
        p_lease_seconds: 180,
      }),
      admin.rpc("claim_planning_session_turn", {
        p_session_id: inserted.data.id,
        p_user_id: org!.owner.id,
        p_token: tokenB,
        p_lease_seconds: 180,
      }),
    ]);
    expect(claims.every((claim) => claim.error == null)).toBe(true);
    const winners = claims.flatMap((claim) => claim.data ?? []);
    expect(winners).toHaveLength(1);
    const winnerToken = winners[0].processing_token as string;
    expect([tokenA, tokenB]).toContain(winnerToken);

    const revision = Number(winners[0].revision ?? 0);
    const current = await admin.from("planning_sessions")
      .update({ state: { objetivo: "novo" }, revision: revision + 1 })
      .eq("id", inserted.data.id)
      .eq("processing_token", winnerToken)
      .eq("revision", revision)
      .select("revision,state");
    expect(current.error).toBeNull();
    expect(current.data).toHaveLength(1);

    const stale = await admin.from("planning_sessions")
      .update({ state: { objetivo: "antigo" }, revision: revision + 1 })
      .eq("id", inserted.data.id)
      .eq("processing_token", winnerToken)
      .eq("revision", revision)
      .select("revision,state");
    expect(stale.error).toBeNull();
    expect(stale.data).toEqual([]);

    const released = await admin.rpc("release_planning_session_turn", {
      p_session_id: inserted.data.id,
      p_token: winnerToken,
    });
    expect(released.error).toBeNull();
    expect(released.data).toBe(true);
  });
});
