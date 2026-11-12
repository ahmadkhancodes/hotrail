import { defineConfig } from "@playwright/test";

const PORT = 3100;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1, // Better Auth rate limits sign-in per IP, so specs that sign in must not run in parallel
  use: {
    baseURL: process.env.BASE_URL ?? `http://localhost:${PORT}`,
    // PW_CHROMIUM lets CI or a sandbox point at a system Chromium when Playwright's own download is absent.
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : undefined,
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        port: PORT,
        reuseExistingServer: true,
        env: { DB_DRIVER: "memory", BUNDLE_STORE: "memory", E2E_OUTBOX: "1", NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`, MAIL_PROVIDER: "console", BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0000", CRON_SECRET: "e2e-cron" },
      },
});
