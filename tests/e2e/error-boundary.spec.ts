import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("recuperação de erro global", () => {
  test.skip(process.env.E2E_STAGING !== "true", "A falha controlada existe somente no build local de teste.");

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.sessionStorage.setItem("oraculo.e2e.renderError", "1"));
  });

  test("mostra código, ações e foco sem estourar a viewport", async ({ page }) => {
    await page.goto("/");
    const heading = page.getByRole("heading", { name: "Não foi possível mostrar esta tela" });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(page.getByText(/ORC-[A-F0-9]{10}/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Dashboard/ })).toHaveAttribute("href", "/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);

    await page.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(heading).toHaveCount(0);
  });
});
