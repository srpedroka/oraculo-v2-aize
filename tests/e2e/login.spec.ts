import { test, expect } from "@playwright/test";

// Só leitura: confirma que a tela de acesso carrega. Não faz login nem grava nada.
// Roda nos projetos "desktop" e "mobile" (ver playwright.config.ts).
test("a tela de acesso carrega com email e botão de entrar", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /entrar|criar acesso/i })).toBeVisible();
});
