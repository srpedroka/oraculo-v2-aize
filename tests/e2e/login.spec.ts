import { test, expect } from "@playwright/test";

// Só leitura: confirma que a tela de acesso carrega. Não faz login nem grava nada.
// Roda nos projetos "desktop" e "mobile" (ver playwright.config.ts).
test("a tela de acesso carrega com email e botão de entrar", async ({ page }) => {
  const requestedPaths: string[] = [];
  page.on("request", (request) => requestedPaths.push(new URL(request.url()).pathname));

  await page.goto("/");
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /entrar|criar acesso/i })).toBeVisible();
  await page.waitForLoadState("networkidle");

  expect(requestedPaths.filter((path) => /pdfjs-dist|pdf\.worker|xlsx|mammoth|jszip/i.test(path))).toEqual([]);

  await page.getByRole("link", { name: "Privacidade e uso de dados" }).click();
  await expect(page).toHaveURL(/\/privacidade$/);
  await expect(page.getByRole("heading", { level: 1, name: "Privacidade e uso de dados" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "WhatsApp, áudio e arquivos" })).toBeVisible();
});
