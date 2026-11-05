import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { buildManifest, generateSigningKeyPair, signManifest } from "@buffersol/hotrail-core";
import { writeZip } from "../../src/lib/ship/zip";

// The Line view end to end on the memory driver: sign in, upload three bundles through the real API with an API key,
// release them, send device beacons, then drive the console (Raise, Reverse) and capture 375/1440 light/dark.
const APP = "com.example.ordering";
const zip = (body: string) => writeZip([{ path: "index.html", data: new TextEncoder().encode(`<html>${body}</html>`) }, { path: "app.js", data: new TextEncoder().encode(body.repeat(200)) }]);

test("Line view: tracks, bundles table, inspector actions, states and screenshots", async ({ page, request, baseURL }) => {
  test.setTimeout(120_000);
  const email = `line+${Date.now()}@studio.test`;
  const origin = { origin: baseURL! };

  // empty state before anything exists is checked after sign in
  await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: origin });
  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0]);
  const org = await page.request.post("/api/auth/organization/create", { data: { name: "Northline Mobile", slug: `northline-${Date.now()}` }, headers: origin });
  const orgId = (await org.json()).id;
  await page.request.post("/api/auth/organization/set-active", { data: { organizationId: orgId }, headers: origin });

  await page.goto("/app");
  await expect(page.getByText("No trains on this line yet.")).toBeVisible();
  await expect(page.getByText("npx @buffersol/hotrail init")).toBeVisible();

  const key = (await (await page.request.post("/api/auth/api-key/create", { data: { name: "ci", organizationId: orgId, metadata: { scope: "all" } }, headers: origin })).json()).key as string;
  const auth = { "x-api-key": key };
  const up = (version: string, body: string) => request.post(`/api/v1/bundles?appId=${APP}&version=${version}&nativeFingerprint=cap8.1`, { headers: auth, data: Buffer.from(zip(body)) });
  for (const [v, b] of [["2.14.0", "a"], ["2.14.1", "b"], ["2.14.2", "c"]] as const) expect((await up(v, b)).status()).toBe(201);
  // CLI style upload against the real server: plan, unauthenticated signed PUT to storage, finalize
  {
    const kp = await generateSigningKeyPair();
    const data = new TextEncoder().encode("<html>cli</html>");
    const manifest = await buildManifest({ appId: "com.example.rewards", version: "1.0.0", nativeFingerprint: "cap8.1", files: [{ path: "index.html", data }] });
    const signed = await signManifest(manifest, kp.privateKey);
    const plan = await request.post("/api/v1/upload/plan", { headers: auth, data: { appId: "com.example.rewards", version: "1.0.0", ...signed, publicKey: kp.publicKey } });
    expect(plan.status()).toBe(200);
    const { missing, uploads } = (await plan.json()) as { missing: string[]; uploads: Record<string, { url: string }> };
    expect(missing).toHaveLength(1);
    expect((await request.put(uploads[missing[0]!]!.url, { data: Buffer.from(data) })).status()).toBe(200); // no key, no Origin
    const fin = await request.post("/api/v1/upload/finalize", { headers: auth, data: { appId: "com.example.rewards", version: "1.0.0" } });
    expect(fin.status()).toBe(200);
    expect((await fin.json()).headcode).toBe("1A00");
    // a cookie session POST from a foreign origin is refused by the control API
    expect((await page.request.post("/api/v1/channels/pause", { data: { appId: APP, channel: "production" }, headers: { origin: "https://evil.test" } })).status()).toBe(403);
  }
  const rel = (channel: string, bundle: string, percent: number) => request.post("/api/v1/channels/release", { headers: auth, data: { appId: APP, channel, bundle, percent } });
  expect((await rel("production", "1A00", 100)).ok()).toBeTruthy();
  expect((await rel("production", "1A01", 25)).ok()).toBeTruthy();
  expect((await rel("beta", "1A01", 100)).ok()).toBeTruthy();
  expect((await rel("staging", "1A02", 100)).ok()).toBeTruthy();
  const beacon = (device: string, action: string, version: string) => request.post("/api/v1/updates/stats", { data: { app_id: APP, device_id: device, action, version_name: version, version_build: "1.8.0", platform: "ios" } });
  for (let i = 0; i < 12; i++) await beacon(`old-${i}`, "set", "2.14.0");
  for (let i = 0; i < 4; i++) await beacon(`new-${i}`, "set", "2.14.1");
  await beacon("new-bad", "update_fail", "2.14.1");

  // the stock plugin protocol answers from pointers
  const check = await (await request.post("/api/v1/updates/check", { data: { app_id: APP, device_id: "old-0", platform: "ios", version_name: "2.14.0", version_build: "1.8.0" } })).json();
  expect(check.message === "no_new_version_available" || check.version === "2.14.1").toBeTruthy();

  // scopes through HTTP: a key without a header is refused, bad key too
  expect((await request.get(`/api/v1/line?appId=${APP}`)).status()).toBe(401);
  expect((await request.get(`/api/v1/line?appId=${APP}`, { headers: { "x-api-key": "nope" } })).status()).toBe(401);

  mkdirSync("docs/qa", { recursive: true });
  await page.goto("/app");
  const tracks = page.getByRole("list", { name: "Channels" });
  await expect(tracks).toBeVisible();
  await expect(tracks.getByRole("button")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: /1A01 Rollout/ })).toBeVisible();
  await expect(page.getByRole("complementary", { name: /Bundle 1A01 detail/ })).toContainText("25%");
  await expect(page.getByRole("table", { name: "Bundles, newest first" }).getByRole("row")).toHaveCount(4);

  for (const theme of ["light", "dark"] as const) {
    for (const width of [1440, 375]) {
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate((t) => localStorage.setItem("theme", t), theme);
      await page.setViewportSize({ width, height: width < 800 ? 812 : 900 });
      await page.reload();
      await expect(tracks).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `overflow @${width} ${theme}`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `docs/qa/line-${width}-${theme}.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => localStorage.setItem("theme", "light"));
  await page.reload();

  // Raise to 50%, live
  await page.getByRole("button", { name: "Raise to 50%" }).click();
  await expect(page.getByRole("complementary", { name: /Bundle 1A01 detail/ })).toContainText("50%");
  expect(((await (await request.get(`/api/v1/channels?appId=${APP}`, { headers: auth })).json()) as { channels: { name: string; percent: number }[] }).channels.find((c) => c.name === "production")!.percent).toBe(50);

  // Reverse to previous, with confirmation
  await page.getByRole("button", { name: "Reverse to 1A00" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Reverse production to 1A00?");
  await dialog.getByRole("button", { name: "Reverse" }).click();
  await expect(page.getByRole("complementary", { name: /Bundle 1A00 detail/ })).toContainText("100%", { timeout: 15_000 });
  const prod = (await (await request.get(`/api/v1/channels?appId=${APP}`, { headers: auth })).json()) as { channels: { name: string; headcode: string; percent: number }[] };
  expect(prod.channels.find((c) => c.name === "production")).toMatchObject({ headcode: "1A00", percent: 100 });
  await page.screenshot({ path: "docs/qa/line-1440-after-reverse.png", fullPage: true });

  // live updates by polling: a change made through the API appears without a reload
  await request.post("/api/v1/channels/pause", { headers: auth, data: { appId: APP, channel: "staging" } });
  await expect(tracks.getByRole("button", { name: /staging/ })).toContainText("Paused", { timeout: 15_000 });

  // error state: the API vanishing keeps the last data and says so
  await page.route("**/api/v1/line*", (r) => r.abort());
  await expect(page.getByText("Lost contact with the server.")).toBeVisible({ timeout: 15_000 });
  await expect(tracks).toBeVisible();
});
