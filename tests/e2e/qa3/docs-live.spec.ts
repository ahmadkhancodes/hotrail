import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { product } from "../../../src/config/product";
import { docSamples, kindOf, urlsIn } from "../../unit/helpers/doc-samples";
import { signInViaUi } from "../qa/helpers";

/**
 * The docs blocks that need a real HTTP server (curl with a real API key, the device URLs and the API's error
 * shape) run here against `next start`. Everything else is run in tests/unit/docs-samples.test.ts.
 */
test.setTimeout(120_000);

/** Splits a doc curl command (with `\` line continuations) into argv for the real curl binary. */
const curlArgs = (code: string) =>
  (code.replace(/\\\n\s*/g, " ").match(/"[^"]*"|\S+/g) ?? []).slice(1).map((w) => w.replace(/^"|"$/g, ""));

test("curl samples answer as documented with a real key, and a wrong key gets the documented error", async ({ page, request, baseURL }) => {
  await signInViaUi(page, request, `docs+${Date.now()}@paul.test`, { org: "Docs Org" });
  await page.goto("/app");
  await page.getByRole("button", { name: "Create a key and fill it in" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Your key is filled in above" })).toBeVisible();
  const key = /HOTRAIL_API_KEY=(\S+)/.exec(await page.getByLabel("Setup commands").innerText())![1]!;
  const orgId = ((await (await page.request.get("/api/auth/get-session")).json()).session.activeOrganizationId) as string;

  const samples = docSamples();
  const curls = samples.filter((s) => kindOf(s) === "curl");
  expect(curls.length).toBeGreaterThan(0);
  const meShape = JSON.parse(samples.find((s) => s.slug === "api" && s.code.includes("orgId"))!.code) as object;
  const errShape = JSON.parse(samples.find((s) => s.slug === "api" && s.code.includes("invalid_api_key"))!.code) as object;
  for (const s of curls) {
    const args = curlArgs(s.code.replace(product.url, baseURL!));
    const raw = execFileSync("curl", ["-sS", ...args.map((a) => a.replace("YOUR_API_KEY", key))], { encoding: "utf8" });
    const ok = JSON.parse(raw);
    expect(ok.error, raw).toBeUndefined();
    expect(Object.keys(ok).sort(), `/docs/${s.slug}`).toEqual(Object.keys(meShape).sort());
    expect(ok.orgId).toBe(orgId);
    const bad = JSON.parse(execFileSync("curl", ["-sS", ...args.map((a) => a.replace("YOUR_API_KEY", "hr_wrong_key_for_docs_test"))], { encoding: "utf8" }));
    expect(bad).toEqual(errShape);
  }
});

test("every device URL in the docs answers the stock updater on this server", async ({ request, baseURL }) => {
  const device = { app_id: "com.docs.none", device_id: "docs-device", version_name: "builtin", version_build: "1", version_code: "1", version_os: "17", platform: "ios", is_emulator: false, is_prod: true, plugin_version: "7.0.0" };
  const seen = new Set<string>();
  for (const s of docSamples().filter((x) => kindOf(x) === "device-urls" || kindOf(x) === "plugin-config")) {
    for (const u of urlsIn(s.code)) seen.add(new URL(u).pathname);
  }
  expect([...seen].sort()).toEqual(["/api/v1/updates/channel", "/api/v1/updates/check", "/api/v1/updates/stats"]);
  // Unknown app: the check endpoint must still answer 200 "no update" (never break the app).
  const check = await request.post(`${baseURL}/api/v1/updates/check`, { data: device });
  expect(check.status()).toBe(200);
  expect(await check.json()).toHaveProperty("message");
  expect((await request.post(`${baseURL}/api/v1/updates/stats`, { data: { ...device, action: "set" } })).status()).toBeLessThan(500);
  expect((await request.get(`${baseURL}/api/v1/updates/channel?app_id=com.docs.none&device_id=docs-device&platform=ios`)).status()).toBeLessThan(500);
});
