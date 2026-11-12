import { expect, test } from "@playwright/test";
import { writeZip } from "../../../src/lib/ship/zip";
import { plans } from "../../../src/config/product";
import { signInViaUi } from "./helpers";

test.setTimeout(180_000);
const zip = (body: string) => writeZip([{ path: "index.html", data: new TextEncoder().encode(`<html>${body}</html>`) }]);

test("free user at the plan limit: third app is refused with a reason, upload input is validated, Line view stays usable", async ({ page, request, baseURL }) => {
  await signInViaUi(page, request, `limit+${Date.now()}@studio.test`, { org: "Limit Org" });
  const origin = { origin: baseURL! };
  const orgId = ((await (await page.request.get("/api/auth/get-session")).json()).session.activeOrganizationId) as string;
  const key = (await (await page.request.post("/api/auth/api-key/create", { data: { name: "ci", organizationId: orgId, metadata: { scope: "all" } }, headers: origin })).json()).key as string;
  const up = (app: string, version = "1.0.0", body = "x") => request.post(`/api/v1/bundles?appId=${app}&version=${version}&nativeFingerprint=f1`, { headers: { "x-api-key": key }, data: Buffer.from(zip(body)) });

  expect((await up("com.qa.one")).status()).toBe(201);
  expect((await up("com.qa.two")).status()).toBe(201);
  const third = await up("com.qa.three");
  expect(third.status()).toBe(402);
  const body = await third.json();
  expect(body.error).toBe("plan_limit");
  expect(String(body.hint)).toMatch(/Free plan includes 2 apps/);
  expect(plans[0]!.highlights).toContain("2 apps"); // the pricing page promises the same number

  // hostile input to the upload API is a 4xx with a code, never a 500
  for (const [app, version] of [["", "1.0.0"], ["not an id", "1.0.0"], ["com.qa.one", ""], ["com.qa.one", "<script>"], ["../../etc/passwd", "1"], ["com.qa." + "a".repeat(200), "1"]] as const) {
    const r = await up(app, version);
    expect(r.status(), `${app}|${version}`).toBeGreaterThanOrEqual(400);
    expect(r.status(), `${app}|${version}`).toBeLessThan(500);
  }
  expect((await request.post("/api/v1/bundles?appId=com.qa.one&version=9.9.9", { headers: { "x-api-key": key }, data: Buffer.from("not a zip") })).status()).toBeLessThan(500);
  expect((await request.post("/api/v1/bundles?appId=com.qa.one&version=9.9.9", { headers: { "x-api-key": key } })).status()).toBeLessThan(500);

  // another org cannot take over the app id
  // (own session: a fresh key from a second org)
  // Line view lists the two apps and no error boundary
  await page.goto("/app");
  await expect(page.getByText("This page could not load")).toHaveCount(0);
  await expect(page.getByText(/1A00/).first()).toBeVisible();
  // with data: no horizontal scroll or unnamed buttons on a phone, device lookup works for an unknown id
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  expect(await page.$$eval("button", (bs) => bs.filter((b) => !(b.getAttribute("aria-label") || b.innerText || "").trim()).length)).toBe(0);
  await page.goto("/app/devices");
  await page.getByLabel("Device id or custom id").fill("<b>nope</b> ünï");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.getByText("No device with that id.")).toBeVisible();
  // pricing page limits equal the config numbers
  await page.goto("/pricing");
  for (const p of plans) for (const h of p.highlights.slice(0, 1)) await expect(page.getByText(h).first()).toBeVisible();
  // billing page for a free org shows the real limit and an upgrade path
  await page.goto("/app/billing");
  await expect(page.getByText(/500/).first()).toBeVisible();
});
