import { defineConfig, devices } from "@playwright/test";

// E2E de leitura contra a produção (ou E2E_BASE_URL). Não faz login nem grava nada:
// apenas confirma que a tela de acesso carrega em desktop e mobile.
const baseURL = process.env.E2E_BASE_URL ?? "https://oraculo-v2-aize.netlify.app";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL, trace: "off", headless: true },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
