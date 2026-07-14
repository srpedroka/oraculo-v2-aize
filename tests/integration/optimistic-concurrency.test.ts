import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = hasStagingEnv();
const d = RUN ? describe : describe.skip;

d("Fatia 5F — duas sessões não sobrescrevem a versão mais nova", () => {
  let org: DisposableOrg | null = null;
  let first: SupabaseClient;
  let second: SupabaseClient;
  let kpiId = "";

  beforeAll(async () => {
    org = await createDisposableOrg("optimistic-concurrency");
    first = anonClient();
    second = anonClient();
    const [firstLogin, secondLogin] = await Promise.all([
      first.auth.signInWithPassword({ email: org.owner.email, password: org.owner.password }),
      second.auth.signInWithPassword({ email: org.owner.email, password: org.owner.password }),
    ]);
    if (firstLogin.error || secondLogin.error) throw firstLogin.error ?? secondLogin.error;

    const kpi = await serviceClient().from("executive_kpis").insert({
      org_id: org.orgId,
      kpi_key: "revenue",
      label: "Faturamento",
      unit: "currency",
      direction: "higher_better",
      flow_type: "flow",
    }).select("id").single();
    if (kpi.error || !kpi.data) throw kpi.error ?? new Error("KPI de teste ausente");
    kpiId = kpi.data.id;

    const settingsSetup = await Promise.all([
      serviceClient().from("ai_function_settings").upsert({
        org_id: org.orgId,
        function: "daily",
        provider: "openai",
        model: "gpt-5.4",
        updated_at: new Date().toISOString(),
      }, { onConflict: "org_id,function" }),
      serviceClient().from("whatsapp_settings").upsert({
        org_id: org.orgId,
        enabled: false,
        weekly_pulse_enabled: false,
        weekly_pulse_weekday: 5,
        weekly_pulse_hour: 16,
        updated_at: new Date().toISOString(),
      }, { onConflict: "org_id" }),
      serviceClient().from("org_ai_tone").upsert({
        org_id: org.orgId,
        preset: "equilibrado",
        axis_acidity: 0,
        axis_drive: 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: "org_id" }),
    ]);
    const settingsError = settingsSetup.find((result) => result.error)?.error;
    if (settingsError) throw settingsError;
  }, 60_000);

  afterAll(async () => {
    if (org) await destroyDisposableOrg(org);
  }, 60_000);

  it("bloqueia a segunda edição do objetivo e registra somente a vencedora", async () => {
    const baseline = await first.from("objectives").select("updated_at").eq("id", org!.objectiveId).single();
    if (baseline.error) throw baseline.error;

    const winner = await first.from("objectives")
      .update({ title: "Versão da primeira aba" })
      .eq("id", org!.objectiveId)
      .eq("updated_at", baseline.data.updated_at)
      .select("id");
    expect(winner.error).toBeNull();
    expect(winner.data).toHaveLength(1);

    const stale = await second.from("objectives")
      .update({ title: "Versão antiga da segunda aba" })
      .eq("id", org!.objectiveId)
      .eq("updated_at", baseline.data.updated_at)
      .select("id");
    expect(stale.error).toBeNull();
    expect(stale.data).toHaveLength(0);

    const stored = await serviceClient().from("objectives").select("title").eq("id", org!.objectiveId).single();
    expect(stored.data?.title).toBe("Versão da primeira aba");
    const revisions = await serviceClient().from("operational_revisions")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org!.orgId)
      .eq("entity_type", "objective")
      .eq("entity_id", org!.objectiveId)
      .eq("action", "update");
    expect(revisions.count).toBe(1);
  });

  it("salva definição e meses juntos e rejeita o segundo lote antigo", async () => {
    const baseline = await first.from("executive_kpis").select("updated_at").eq("id", kpiId).single();
    if (baseline.error) throw baseline.error;
    const args = {
      p_org_id: org!.orgId,
      p_kpi_id: kpiId,
      p_year: 2026,
      p_expected_kpi_updated_at: baseline.data.updated_at,
      p_annual_target: 12_000,
      p_opening_balance: null,
      p_months: [1],
      p_expected_month_updated_at: [null],
      p_target_values: [1000],
      p_target_stages: [null],
      p_actual_values: [900],
      p_secondary_actuals: [null],
      p_notes: [null],
    };

    const winner = await first.rpc("save_kpi_editor_if_current", args);
    expect(winner.error).toBeNull();
    expect((winner.data as { ok?: boolean })?.ok).toBe(true);
    const stale = await second.rpc("save_kpi_editor_if_current", { ...args, p_annual_target: 99_000 });
    expect(stale.error).toBeNull();
    expect((stale.data as { conflict?: boolean })?.conflict).toBe(true);

    const storedKpi = await serviceClient().from("executive_kpis").select("annual_target").eq("id", kpiId).single();
    const storedMonth = await serviceClient().from("kpi_monthly_values").select("target_value, actual_value").eq("kpi_id", kpiId).eq("year", 2026).eq("month", 1).single();
    expect(Number(storedKpi.data?.annual_target)).toBe(12_000);
    expect(Number(storedMonth.data?.target_value)).toBe(1000);
    expect(Number(storedMonth.data?.actual_value)).toBe(900);
  }, 60_000);

  it("protege o modelo de IA configurado para cada função", async () => {
    const baseline = await serviceClient().from("ai_function_settings")
      .select("updated_at")
      .eq("org_id", org!.orgId)
      .eq("function", "daily")
      .single();
    if (baseline.error) throw baseline.error;
    const args = {
      p_org_id: org!.orgId,
      p_function: "daily",
      p_expected_updated_at: baseline.data.updated_at,
      p_provider: "xai",
      p_model: "grok-4.5",
    };
    const winner = await serviceClient().rpc("save_ai_function_if_current", args);
    expect(winner.error).toBeNull();
    expect((winner.data as { ok?: boolean })?.ok).toBe(true);
    const stale = await serviceClient().rpc("save_ai_function_if_current", { ...args, p_model: "grok-4.3" });
    expect(stale.error).toBeNull();
    expect((stale.data as { conflict?: boolean })?.conflict).toBe(true);
    const stored = await serviceClient().from("ai_function_settings")
      .select("provider, model")
      .eq("org_id", org!.orgId)
      .eq("function", "daily")
      .single();
    expect(stored.data).toMatchObject({ provider: "xai", model: "grok-4.5" });
  });

  it("protege a configuração do WhatsApp sem expor segredos", async () => {
    const baseline = await serviceClient().from("whatsapp_settings")
      .select("updated_at")
      .eq("org_id", org!.orgId)
      .single();
    if (baseline.error) throw baseline.error;
    const args = {
      p_org_id: org!.orgId,
      p_expected_updated_at: baseline.data.updated_at,
      p_instance_url: "https://evolution.example.test",
      p_instance_name: "oraculo-test",
      p_connected_number: "",
      p_enabled: false,
      p_weekly_pulse_enabled: true,
      p_weekly_pulse_weekday: 5,
      p_weekly_pulse_hour: 16,
      p_api_key: "",
      p_webhook_secret: "",
      p_key_preview: null,
      p_webhook_secret_preview: null,
    };
    const winner = await serviceClient().rpc("save_whatsapp_settings_if_current", args);
    expect(winner.error).toBeNull();
    expect((winner.data as { ok?: boolean })?.ok).toBe(true);
    const stale = await serviceClient().rpc("save_whatsapp_settings_if_current", { ...args, p_weekly_pulse_hour: 9 });
    expect(stale.error).toBeNull();
    expect((stale.data as { conflict?: boolean })?.conflict).toBe(true);
    const stored = await serviceClient().from("whatsapp_settings")
      .select("instance_name, weekly_pulse_enabled, weekly_pulse_hour")
      .eq("org_id", org!.orgId)
      .single();
    expect(stored.data).toMatchObject({
      instance_name: "oraculo-test",
      weekly_pulse_enabled: true,
      weekly_pulse_hour: 16,
    });
  });

  it("preserva o tom mais novo da empresa", async () => {
    const baseline = await first.from("org_ai_tone")
      .select("updated_at")
      .eq("org_id", org!.orgId)
      .single();
    if (baseline.error) throw baseline.error;
    const winner = await first.from("org_ai_tone")
      .update({ preset: "direto", axis_drive: 2, updated_at: new Date().toISOString() })
      .eq("org_id", org!.orgId)
      .eq("updated_at", baseline.data.updated_at)
      .select("org_id");
    expect(winner.error).toBeNull();
    expect(winner.data).toHaveLength(1);
    const stale = await second.from("org_ai_tone")
      .update({ preset: "acolhedor", axis_drive: -2, updated_at: new Date().toISOString() })
      .eq("org_id", org!.orgId)
      .eq("updated_at", baseline.data.updated_at)
      .select("org_id");
    expect(stale.error).toBeNull();
    expect(stale.data).toHaveLength(0);
    const stored = await serviceClient().from("org_ai_tone")
      .select("preset, axis_drive")
      .eq("org_id", org!.orgId)
      .single();
    expect(stored.data).toMatchObject({ preset: "direto", axis_drive: 2 });
  });
});
