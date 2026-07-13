import { defineConfig, devices } from "@playwright/test";

const stagingMode = process.env.E2E_STAGING === "true";
const localStagingUrl = "http://127.0.0.1:4174";
const baseURL = process.env.E2E_BASE_URL ?? (stagingMode ? localStagingUrl : "https://oraculo-v2-aize.netlify.app");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: !stagingMode,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL, trace: "off", headless: true },
  webServer: stagingMode
    ? {
        command: "pnpm exec vite --host 127.0.0.1 --port 4174",
        url: localStagingUrl,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          VITE_SUPABASE_URL: process.env.SUPABASE_STAGING_URL ?? "",
          VITE_SUPABASE_ANON_KEY: process.env.SUPABASE_STAGING_ANON_KEY ?? "",
        },
      }
    : undefined,
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
