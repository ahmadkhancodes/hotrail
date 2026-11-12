import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { writeZip } from "../../src/lib/ship/zip";

// M4 pages on the memory driver: billing limits and overage panel, notification preferences, audit log with CSV export.
// Screenshots at 375/1440, light into docs/qa.
const APP = "com.example.northline.m4";
const zip = writeZip([{ path: "index.html", data: new TextEncoder().encode("<html>m4</html>") }]);

test("billing limits, notification preferences, audit export", async ({ page, request, baseURL }) => {
  test.setTimeout(120_000);
  const email = `m4+${Date.now()}@studio.test`;
  const origin = { origin: baseURL! };
  await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: origin });
  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0]);
  const org = await page.request.post("/api/auth/organization/create", { data: { name: "Northline Mobile", slug: `northline-m4-${Date.now()}` }, headers: origin });
  const orgId = (await org.json()).id;
  await page.request.post("/api/auth/organization/set-active", { data: { organizationId: orgId }, headers: origin });
  const key = (await (await page.request.post("/api/auth/api-key/create", { data: { name: "ci", organizationId: orgId, metadata: { scope: "all" } }, headers: origin })).json()).key as string;
  const auth = { "x-api-key": key };
  expect((await request.post(`/api/v1/bundles?appId=${APP}&version=1.0.0`, { headers: auth, data: Buffer.from(zip) })).status()).toBe(201);
  expect((await request.post("/api/v1/channels/release", { headers: auth, data: { appId: APP, channel: "production", bundle: "1A00", percent: 100 } })).ok()).toBeTruthy();
  for (let i = 0; i < 3; i++) await request.post("/api/v1/updates/check", { data: { app_id: APP, device_id: `m4-dev-${i}`, platform: "ios", version_name: "builtin", version_build: "1" } });

  // MAU is counted after the response, so give it a moment, then read it from the billing page.
  await expect(async () => {
    await page.goto("/app/billing");
    await expect(page.getByText("3 of 500", { exact: true })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Limits and overage" })).toBeVisible();
  await expect(page.getByText("Overage is available on paid plans.")).toBeVisible();

  mkdirSync("docs/qa", { recursive: true });
  const shoot = async (path: string, name: string) => {
    for (const theme of ["light"] as const) {
      for (const width of [1440, 375]) {
        await page.setViewportSize({ width, height: width < 800 ? 812 : 900 });
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${name} overflow @${width} ${theme}`).toBeLessThanOrEqual(0);
        await page.screenshot({ path: `docs/qa/${name}-${width}-${theme}.png`, fullPage: true });
      }
    }
  };
  await shoot("/app/billing", "billing-limits");

  await page.goto("/app/settings/notifications");
  const sw = page.getByRole("switch", { name: "Rollbacks" });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await expect(page.getByRole("switch", { name: "Rollbacks" })).toHaveAttribute("aria-checked", "false");
  await shoot("/app/settings/notifications", "notifications");

  await page.goto("/app/settings/audit");
  await expect(page.getByRole("link", { name: "Export CSV" })).toBeVisible();
  await expect(page.getByText("channel.released").first()).toBeVisible();
  const csv = await page.request.get("/api/audit/export");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const text = await csv.text();
  expect(text.split("\r\n")[0]).toBe("time_utc,action,actor,target,ip,details");
  expect(text).toContain("channel.released");
  expect(text).toContain("apikey.created");
  await shoot("/app/settings/audit", "audit");
});
