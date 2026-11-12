import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { writeZip } from "../../src/lib/ship/zip";
import { signInViaApi } from "./qa/helpers";

// Design QA pass (docs/design-brief.md): seeds a realistic org, then captures every marketing and signed-in screen
// at 1440 and 375 (light) into docs/qa/design/, failing on horizontal overflow.
// Opt in with DESIGN_QA=1 npx playwright test design: it signs in and loads ~30 screens, which would spend the suite's
// shared per IP Better Auth budget (60 auth requests a minute) and starve the specs that run after it.
const OUT = "docs/qa/design";
// Distinct from line.spec, which shares the server. DESIGN_APP lets a rerun against a long lived dev server pick a fresh id.
const APP = process.env.DESIGN_APP ?? "com.northline.ordering";
const zip = (body: string) => writeZip([{ path: "index.html", data: new TextEncoder().encode(`<html>${body}</html>`) }, { path: "app.js", data: new TextEncoder().encode(body.repeat(200)) }]);

async function shoot(page: Page, name: string) {
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: width < 800 ? 812 : 900 });
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${name} overflow @${width}`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${OUT}/${name}-${width}.png`, fullPage: true });
  }
}

test("design QA screenshots: marketing and console, 1440 and 375", async ({ page, request, baseURL }) => {
  test.skip(!process.env.DESIGN_QA, "opt in with DESIGN_QA=1");
  test.setTimeout(240_000);
  mkdirSync(OUT, { recursive: true });
  await page.emulateMedia({ colorScheme: "light" });
  for (const [route, name] of [["/", "home"], ["/pricing", "pricing"], ["/compare/capgo", "compare-capgo"], ["/docs/quickstart", "docs-quickstart"], ["/sign-in", "sign-in"]] as const) {
    await page.goto(route);
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); } window.scrollTo(0, 0); });
    await shoot(page, name);
  }

  const email = `design+${Date.now()}@northline.test`;
  const origin = { origin: baseURL! };
  await signInViaApi(page, request, email, baseURL!);
  const orgId = (await (await page.request.post("/api/auth/organization/create", { data: { name: "Northline Mobile", slug: `northline-${Date.now()}` }, headers: origin })).json()).id;
  await page.request.post("/api/auth/organization/set-active", { data: { organizationId: orgId }, headers: origin });

  await page.goto("/app");
  await expect(page.getByText("No trains on this line yet.")).toBeVisible();
  await shoot(page, "app-line-empty");

  const key = (await (await page.request.post("/api/auth/api-key/create", { data: { name: "ci-upload", organizationId: orgId, metadata: { scope: "all" } }, headers: origin })).json()).key as string;
  const auth = { "x-api-key": key };
  for (const [v, b] of [["2.14.0", "a"], ["2.14.1", "b"], ["2.14.2", "c"]] as const) {
    expect((await request.post(`/api/v1/bundles?appId=${APP}&version=${v}&nativeFingerprint=cap8.1`, { headers: auth, data: Buffer.from(zip(b)) })).status()).toBe(201);
  }
  const rel = (channel: string, bundle: string, percent: number) => request.post("/api/v1/channels/release", { headers: auth, data: { appId: APP, channel, bundle, percent } });
  await rel("production", "1A00", 100);
  await rel("production", "1A01", 25);
  await rel("beta", "1A01", 100);
  await rel("staging", "1A02", 100);
  const beacon = (device: string, action: string, version: string) => request.post("/api/v1/updates/stats", { data: { app_id: APP, device_id: device, action, version_name: version, version_build: "1.8.0", platform: "ios" } });
  for (let i = 0; i < 12; i++) await beacon(`old-${i}`, "set", "2.14.0");
  for (let i = 0; i < 4; i++) await beacon(`new-${i}`, "set", "2.14.1");
  await beacon("new-bad", "update_fail", "2.14.1");

  await page.goto("/app");
  await expect(page.getByRole("list", { name: "Channels" })).toBeVisible();
  await shoot(page, "app-line");
  await page.getByRole("button", { name: "Reverse to 1A00" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await shoot(page, "app-dialog");
  await page.keyboard.press("Escape");

  for (const [route, name] of [
    ["/app/devices", "app-devices"], ["/app/billing", "app-billing"], ["/app/settings/api-keys", "app-api-keys"],
    ["/app/settings/members", "app-members"], ["/app/settings/webhooks", "app-webhooks"], ["/app/settings/audit", "app-audit"],
    ["/app/settings/profile", "app-profile"], ["/app/settings/security", "app-security"], ["/app/settings/notifications", "app-notifications"],
  ] as const) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    await shoot(page, name);
  }
});
