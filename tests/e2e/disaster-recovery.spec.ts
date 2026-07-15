import { expect, test, type Page } from "@playwright/test";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { anonClient, hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = process.env.E2E_STAGING === "true" && hasStagingEnv();
const stagingUrl = process.env.SUPABASE_STAGING_URL ?? "";
const anonKey = process.env.SUPABASE_STAGING_ANON_KEY ?? "";
let org: DisposableOrg | null = null;
let ownerToken = "";
let targetOrgId = "";
let restoreRunId = "";

async function callBackup(action: Record<string, unknown>, requestId: string) {
  const response = await fetch(`${stagingUrl}/functions/v1/organization-backup`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${ownerToken}`,
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({ orgId: org?.orgId, ...action }),
  });
  const body = await response.json() as Record<string, any>;
  if (!response.ok) throw new Error(String(body.error ?? `Backup HTTP ${response.status}`));
  return body;
}

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill(org!.owner.email);
  await page.getByLabel("Senha", { exact: true }).fill(org!.owner.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard executivo" })).toBeVisible();
}

test.describe("Fatia 6F — cópia restaurada navegável", () => {
  test.skip(!RUN, "A prova de recuperação usa somente staging descartável.");

  test.beforeAll(async ({}, workerInfo) => {
    if (workerInfo.project.name !== "desktop") return;
    org = await createDisposableOrg("6f-e2e-restore");
    const service = serviceClient();
    const { data: kpi, error: kpiError } = await service
      .from("executive_kpis")
      .insert({ org_id: org.orgId, kpi_key: "revenue", label: "Receita recuperada E2E", unit: "currency", annual_target: 1_200_000 })
      .select("id")
      .single();
    if (kpiError) throw kpiError;
    const seeded = await Promise.all([
      service.from("strategic_plans").insert({
        org_id: org.orgId,
        year: 2026,
        profile: { business: "Operação recuperada" },
        drivers: { purpose: "Provar continuidade" },
        swot: { strengths: ["Backup"], weaknesses: [], opportunities: [], threats: [] },
        themes: ["Continuidade"],
        rituals: ["Teste trimestral"],
        executive_summary: "Plano estratégico recuperado E2E.",
      }),
      service.from("plan_documents").insert({
        org_id: org.orgId,
        type: "strategic",
        origin: "historical",
        period: "2026",
        title: "Documento recuperado E2E",
        content: { summary: "Documento para validar a recuperação." },
        version: 1,
        created_by: org.owner.id,
      }),
      service.from("kpi_monthly_values").insert({
        org_id: org.orgId,
        kpi_id: kpi.id,
        year: 2026,
        month: 6,
        target_value: 100_000,
        actual_value: 98_500,
        updated_by: org.owner.id,
      }),
      service.from("operational_revisions").insert({
        org_id: org.orgId,
        entity_type: "objective",
        entity_id: org.objectiveId,
        action: "update",
        before_data: { status: "on_track" },
        after_data: { status: "at_risk" },
        changed_by: org.owner.id,
      }),
    ]);
    const seedError = seeded.find((result) => result.error)?.error;
    if (seedError) throw seedError;

    const owner = anonClient();
    const session = await owner.auth.signInWithPassword({ email: org.owner.email, password: org.owner.password });
    if (session.error || !session.data.session) throw session.error ?? new Error("Sessão owner ausente");
    ownerToken = session.data.session.access_token;
    await callBackup({ action: "create" }, `6f-e2e-backup-${Date.now()}`);
    const drill = await callBackup({ action: "drill", exerciseType: "monthly_drill" }, `6f-e2e-drill-${Date.now()}`);
    targetOrgId = String(drill.targetOrgId ?? "");
    restoreRunId = String(drill.restoreRunId ?? "");
    if (!targetOrgId || !restoreRunId || drill.verification?.passed !== true) throw new Error("Clone verificado não foi criado");
  }, 120_000);

  test.afterAll(async ({}, workerInfo) => {
    if (workerInfo.project.name !== "desktop" || !org) return;
    try {
      if (restoreRunId) await callBackup({ action: "discard_drill", restoreRunId }, `6f-e2e-clean-${Date.now()}`);
    } finally {
      if (targetOrgId) await serviceClient().from("organizations").delete().eq("id", targetOrgId);
      await destroyDisposableOrg(org);
      org = null;
    }
  }, 120_000);

  test("abre planos, documentos, KPI e histórico no clone", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "A restauração real roda uma vez para evitar clones duplicados.");
    if (!org || !targetOrgId) throw new Error("Clone de recuperação ausente");
    await login(page);
    await page.evaluate((orgId) => window.localStorage.setItem("oraculo.activeOrgId", orgId), targetOrgId);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard executivo" })).toBeVisible();
    await expect(page.getByText("Receita recuperada E2E")).toBeVisible();

    await page.goto("/estrategico");
    await expect(page.getByText("Plano estratégico recuperado E2E.")).toBeVisible();

    await page.goto("/documentos");
    await expect(page.getByRole("heading", { name: "Documento recuperado E2E" })).toBeVisible();

    await page.goto("/arquivo");
    await expect(page.getByRole("heading", { name: "Histórico de alterações" })).toBeVisible();
    await expect(page.getByText("Objetivo", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Atualizado", { exact: true }).first()).toBeVisible();
  });
});
