import { expect, test, type Page } from "@playwright/test";
import { createDisposableOrg, destroyDisposableOrg, type DisposableOrg } from "../helpers/factory";
import { hasStagingEnv, serviceClient } from "../helpers/staging";

const RUN = process.env.E2E_STAGING === "true" && hasStagingEnv();
let org: DisposableOrg | null = null;
let onboardingUser: { id: string; email: string; password: string } | null = null;

async function login(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

test.describe("Fatia 4A — jornadas críticas autenticadas", () => {
  test.skip(!RUN, "Jornadas autenticadas rodam somente no staging descartável.");

  test.beforeAll(async () => {
    org = await createDisposableOrg("4a-e2e");
    const service = serviceClient();

    const { data: strategicObjective, error: objectiveError } = await service
      .from("objectives")
      .insert({
        org_id: org.orgId,
        level: "strategic",
        type: "seed",
        title: "Expandir capacidade digital E2E",
        result: "Capacidade implantada",
        target: "100%",
        period: "2026",
        owner: "Owner E2E",
      })
      .select("id")
      .single();
    if (objectiveError) throw objectiveError;

    const seedOperations = [
      service.from("strategic_plans").insert({
        org_id: org.orgId,
        year: 2026,
        profile: { business: "Teste E2E" },
        drivers: { purpose: "Validar jornadas" },
        swot: { strengths: ["Automação"], weaknesses: [], opportunities: [], threats: [] },
        themes: ["Execução"],
        rituals: ["Revisão mensal"],
        executive_summary: "Plano estratégico descartável para cobertura E2E.",
      }),
      service.from("area_plans").insert({
        org_id: org.orgId,
        area_id: org.areas.producaoId,
        year: 2026,
        role: { mission: "Entregar com qualidade" },
        linked_strategic_objective_ids: [strategicObjective.id],
        diagnosis: { challenge: "Escala" },
      }),
      service.from("plan_documents").insert({
        org_id: org.orgId,
        area_id: org.areas.producaoId,
        type: "monthly",
        origin: "historical",
        period: "Jun 2026",
        title: "Histórico descartável E2E",
        content: { raw: "Plano mensal anterior para validar a tela de documentos." },
        version: 1,
        created_by: org.owner.id,
      }),
      service.from("plan_documents").insert({
        org_id: org.orgId,
        type: "strategic",
        origin: "session",
        period: "2026",
        title: "Plano anual de qualidade E2E",
        content: {
          empresa: "Empresa E2E",
          periodo: "2026",
          strategic: {
            temas: ["Crescer com previsibilidade"],
            renuncias: ["Nao abrir projetos paralelos"],
            riscos: ["Crescer sem margem"],
            decisoes_pendentes: ["Definir substituto para responsabilidades concentradas"],
            aprendizados_historicos: ["No ciclo anterior faltaram dono e rotina de decisao"],
          },
          objetivos: [
            {
              numero: 1,
              titulo: "Aumentar a previsibilidade da receita",
              atual: "55%",
              indicador: "Receita prevista realizada",
              meta: "80%",
              fonte: "CRM",
              estrategias: ["Revisar o funil semanalmente"],
            },
          ],
        },
        version: 1,
        created_by: org.owner.id,
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
      service.from("administrative_audit_events").insert({
        org_id: org.orgId,
        category: "security",
        action: "mfa_policy_updated",
        actor_user_id: org.owner.id,
        actor_name: "E2E owner",
        target_type: "organization_security",
        target_id: org.orgId,
        target_label: "Ações críticas",
        before_data: { requireMfaForCriticalActions: false },
        after_data: { requireMfaForCriticalActions: true },
        request_id: `e2e-audit-${Date.now()}`,
      }),
    ];
    const seeded = await Promise.all(seedOperations);
    const seedError = seeded.find((result) => result.error)?.error;
    if (seedError) throw seedError;

    const { data: kpi, error: kpiError } = await service
      .from("executive_kpis")
      .insert({ org_id: org.orgId, kpi_key: "revenue", label: "Faturamento E2E", unit: "currency", annual_target: 1_200_000 })
      .select("id")
      .single();
    if (kpiError) throw kpiError;
    const { error: valueError } = await service.from("kpi_monthly_values").insert({
      org_id: org.orgId,
      kpi_id: kpi.id,
      year: 2026,
      month: 6,
      target_value: 100_000,
      actual_value: 95_000,
      updated_by: org.owner.id,
    });
    if (valueError) throw valueError;

    const password = "Oraculo-E2E-onboarding-123!";
    const email = `e2e-onboarding-${Date.now()}@oraculo-e2e.invalid`;
    const { data: userData, error: userError } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (userError || !userData.user) throw userError ?? new Error("Usuário de onboarding não criado");
    const { error: profileError } = await service.from("profiles").upsert({ id: userData.user.id, full_name: "E2E Onboarding", email });
    if (profileError) throw profileError;
    onboardingUser = { id: userData.user.id, email, password };
  });

  test.afterAll(async () => {
    if (org) await destroyDisposableOrg(org);
    if (onboardingUser) {
      const { error } = await serviceClient().auth.admin.deleteUser(onboardingUser.id);
      if (error) throw error;
    }
    org = null;
    onboardingUser = null;
  });

  test("login real e módulos essenciais carregam dados da empresa", async ({ page }, testInfo) => {
    if (!org) throw new Error("fixture ausente");
    await login(page, org.owner.email, org.owner.password);
    await expect(page.getByRole("heading", { name: "Dashboard executivo" })).toBeVisible();
    await expect(page.getByText("Faturamento E2E")).toBeVisible();

    await page.getByRole("button", { name: "Lançar / Editar" }).click();
    await expect(page.getByRole("heading", { name: "Lançar KPIs" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    const routes = [
      ["/estrategico", "Plano Estratégico"],
      ["/planos-trimestrais", "Planos Trimestrais"],
      ["/documentos", "Documentos"],
      ["/areas", "Áreas"],
      ["/execucao", "Execução Viva"],
      ["/arquivo", "Arquivo operacional"],
      ["/configuracoes", "Configurações"],
    ] as const;
    for (const [path, heading] of routes) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }

    await page.getByRole("tab", { name: "IA do Oráculo" }).click();
    await expect(page.getByRole("heading", { name: "IA do Oráculo" })).toBeVisible();
    await expect(page.getByText("Chaves por provedor")).toBeVisible();

    await page.getByRole("tab", { name: "WhatsApp" }).click();
    await expect(page.getByRole("heading", { name: "WhatsApp", exact: true })).toBeVisible();
    await expect(page.getByPlaceholder(/Chave da Evolution API/)).toBeVisible();

    await page.getByRole("tab", { name: "Backups" }).click();
    await expect(page.getByRole("heading", { name: "Recuperação de desastre" })).toBeVisible();
    await expect(page.getByText("Até 30 min")).toBeVisible();
    await expect(page.getByText("Até 4h")).toBeVisible();
    await expect(page.getByRole("button", { name: "Testar recuperação" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const settingsSections = page.getByTestId("settings-sections");
    if (testInfo.project.name === "desktop") {
      expect(await settingsSections.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    if (testInfo.project.name === "mobile") {
      const launcher = page.getByRole("button", { name: "Abrir Oráculo" });
      const launcherBox = await launcher.boundingBox();
      const menuBox = await page.getByRole("button", { name: "Abrir menu" }).boundingBox();
      expect(launcherBox).not.toBeNull();
      expect(menuBox).not.toBeNull();
      expect(launcherBox!.y + launcherBox!.height).toBeLessThanOrEqual(56);
      expect(launcherBox!.x + launcherBox!.width).toBeLessThanOrEqual(menuBox!.x);
    }
    if (process.env.QA_SCREENSHOTS === "true") {
      await page.screenshot({ path: testInfo.outputPath(`recuperacao-${testInfo.project.name}.png`), fullPage: true });
    }

    await page.getByRole("tab", { name: "Segurança" }).click();
    await expect(page.getByRole("heading", { name: "Saúde operacional" })).toBeVisible();
    await page.getByRole("button", { name: "Registrar incidente" }).click();
    await expect(page.getByText("Ocorrência", { exact: true })).toBeVisible();
    await expect(page.getByText("Severidade", { exact: true })).toBeVisible();
    await expect(page.getByText("Serviço principal", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByRole("tab", { name: "Auditoria" }).click();
    await expect(page.getByRole("heading", { name: "Auditoria administrativa" })).toBeVisible();
    await expect(page.getByText("Política de MFA alterada")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (process.env.QA_SCREENSHOTS === "true") {
      await page.screenshot({ path: testInfo.outputPath(`auditoria-${testInfo.project.name}.png`), fullPage: true });
    }

    await page.getByRole("tab", { name: "Privacidade" }).click();
    await expect(page.getByRole("heading", { name: "Privacidade e uso de dados" })).toBeVisible();
    await expect(page.getByText("Owner da organização")).toBeVisible();
    await page.getByRole("button", { name: "Registrar ciência da versão 2026-07-15-r2" }).click();
    await expect(page.getByText("Ciência registrada")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Ciência registrada")).toBeVisible();

    await page.getByRole("tab", { name: "Minha conta" }).click();
    await expect(page.getByRole("heading", { name: "Minha conta", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar perfil" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Baixar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Excluir" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByRole("heading", { name: "Excluir sua conta do Oráculo?" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (process.env.QA_SCREENSHOTS === "true") {
      await page.screenshot({ path: testInfo.outputPath(`minha-conta-${testInfo.project.name}.png`), fullPage: true });
    }
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    await page.goto("/documentos");
    await expect(page.getByRole("button", { name: /Histórico descartável E2E/ })).toBeVisible();
    await page.getByRole("button", { name: /Plano anual de qualidade E2E/ }).click();
    await expect(page.getByRole("heading", { name: "Plano anual de qualidade E2E" })).toBeVisible();
    await expect(page.getByText("Renúncias:")).toBeVisible();
    await expect(page.getByText("Decisões pendentes:")).toBeVisible();
    await expect(page.getByText("Aprendizados anteriores:")).toBeVisible();
    await expect(page.getByText(/Baseline: 55%/)).toBeVisible();
    await expect(page.getByText("Revisar o funil semanalmente")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (process.env.QA_SCREENSHOTS === "true") {
      await page.screenshot({ path: testInfo.outputPath(`plano-anual-${testInfo.project.name}.png`), fullPage: true });
    }
    await page.getByRole("button", { name: "Importar histórico" }).first().click();
    await expect(page.getByRole("heading", { name: "Importar histórico" })).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveAttribute("accept", /\.pdf/);
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    await page.goto("/arquivo");
    await expect(page.getByRole("heading", { name: "Histórico de alterações" })).toBeVisible();
  });

  test("usuário sem empresa vê onboarding e restauração, sem criar dados", async ({ page }) => {
    if (!onboardingUser) throw new Error("fixture ausente");
    await login(page, onboardingUser.email, onboardingUser.password);
    await expect(page.getByRole("heading", { name: "Crie a primeira empresa" })).toBeVisible();
    await expect(page.getByLabel("Nome da empresa")).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar empresa" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Importar pacote de backup" })).toBeVisible();
    await page.getByRole("button", { name: "Minha conta" }).click();
    await expect(page).toHaveURL(/\/minha-conta$/);
    await expect(page.getByRole("heading", { name: "Dados e acesso" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Minha conta", exact: true })).toBeVisible();
  });

  test("recuperação informa sucesso sem disparar email real", async ({ page }) => {
    await page.route("**/auth/v1/recover**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.goto("/redefinir-senha");
    await page.getByLabel("Email").fill("recuperacao@oraculo-e2e.invalid");
    await page.getByRole("button", { name: "Enviar link por email" }).click();
    await expect(page.getByText(/Enviamos um link para redefinir sua senha/)).toBeVisible();
  });
});
