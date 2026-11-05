import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { nativeFingerprint } from "@buffersol/hotrail-core";
import { writeZip } from "../../src/lib/ship/zip";

// M3 pages on the memory driver: adoption chart + "not offered to build N" + bundle delete guard on the Line view,
// and the device lookup page. Screenshots at 375/1440, light/dark into docs/qa.
const APP = "com.example.northline.m3";
const camera = { capacitor: "8.0.0", plugins: { "@capacitor/camera": "8.2.0" } };
const zip = (body: string) => writeZip([{ path: "index.html", data: new TextEncoder().encode(`<html>${body}</html>`) }, { path: "app.js", data: new TextEncoder().encode(body.repeat(100)) }]);

test("Line adoption chart, incompatible builds, delete guard, device lookup", async ({ page, request, baseURL }) => {
  test.setTimeout(120_000);
  const email = `m3+${Date.now()}@studio.test`;
  const origin = { origin: baseURL! };
  await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: origin });
  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0]);
  const org = await page.request.post("/api/auth/organization/create", { data: { name: "Northline Mobile", slug: `northline-m3-${Date.now()}` }, headers: origin });
  const orgId = (await org.json()).id;
  await page.request.post("/api/auth/organization/set-active", { data: { organizationId: orgId }, headers: origin });
  const key = (await (await page.request.post("/api/auth/api-key/create", { data: { name: "ci", organizationId: orgId, metadata: { scope: "all" } }, headers: origin })).json()).key as string;
  const auth = { "x-api-key": key };

  const fp = await nativeFingerprint(camera);
  for (const [v, b] of [["2.14.0", "a"], ["2.14.1", "b"], ["2.14.2", "c"]] as const) {
    const r = await request.post(`/api/v1/bundles?appId=${APP}&version=${v}&nativeFingerprint=${fp}&native=${encodeURIComponent(JSON.stringify(camera))}`, { headers: auth, data: Buffer.from(zip(b)) });
    expect(r.status()).toBe(201);
  }
  const reg = (build: string, native: unknown) => request.post("/api/v1/native-builds", { headers: auth, data: { appId: APP, versionBuild: build, native } });
  expect((await reg("41", camera)).status()).toBe(201);
  expect((await reg("38", { capacitor: "8.0.0", plugins: {} })).status()).toBe(201);
  const rel = (bundle: string, percent: number) => request.post("/api/v1/channels/release", { headers: auth, data: { appId: APP, channel: "production", bundle, percent } });
  expect((await rel("1A00", 100)).ok()).toBeTruthy();
  expect((await rel("1A01", 100)).ok()).toBeTruthy();

  const beacon = (device: string, action: string, version: string, custom?: string) =>
    request.post("/api/v1/updates/stats", { data: { app_id: APP, device_id: device, custom_id: custom, action, version_name: version, version_build: "41", platform: "ios" } });
  for (let i = 0; i < 9; i++) await beacon(`old-${i}`, "set", "2.14.0");
  for (let i = 0; i < 5; i++) await beacon(`new-${i}`, "set", "2.14.1");
  await beacon("dev-ada", "download_complete", "2.14.1", "user-8841");
  await beacon("dev-ada", "set", "2.14.1", "user-8841");
  await beacon("dev-ada", "update_fail", "2.14.1", "user-8841");

  mkdirSync("docs/qa", { recursive: true });
  await page.goto("/app");
  const chart = page.getByTestId("adoption-chart");
  await expect(chart.getByRole("img", { name: /Adoption by bundle/ })).toBeVisible({ timeout: 15_000 });
  await expect(chart).toContainText("applied");

  // select the idle bundle 1A02: it is not live, so the incompatible note and Delete show
  await page.getByRole("button", { name: "Select bundle 1A02" }).click();
  await expect(page.getByTestId("incompatible")).toContainText("build 38 lacks @capacitor/camera");

  // delete guard in the UI: live bundle cannot be deleted (the button only exists for idle bundles), API refuses too
  const refused = await request.delete(`/api/v1/bundles?appId=${APP}&bundle=1A01`, { headers: auth });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).error).toBe("bundle_live");
  await page.getByRole("button", { name: "Delete bundle" }).click();
  await expect(page.getByRole("dialog")).toContainText("Delete bundle 1A02?");
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("button", { name: "Select bundle 1A02" })).toHaveCount(0, { timeout: 15_000 });

  for (const theme of ["light", "dark"] as const) {
    for (const width of [1440, 375]) {
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate((t) => localStorage.setItem("theme", t), theme);
      await page.setViewportSize({ width, height: width < 800 ? 812 : 900 });
      await page.goto("/app");
      await expect(chart.getByRole("img", { name: /Adoption by bundle/ })).toBeVisible({ timeout: 15_000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `line overflow @${width} ${theme}`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `docs/qa/line-adoption-${width}-${theme}.png`, fullPage: true });
    }
  }

  // device lookup by custom id, then by device id
  for (const theme of ["light", "dark"] as const) {
    for (const width of [1440, 375]) {
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate((t) => localStorage.setItem("theme", t), theme);
      await page.setViewportSize({ width, height: width < 800 ? 812 : 900 });
      await page.goto("/app/devices");
      await expect(page.getByRole("heading", { name: "Devices", level: 1 })).toBeVisible();
      await page.getByLabel("Device id or custom id").fill("user-8841");
      await page.getByRole("button", { name: "Look up" }).click();
      const table = page.getByRole("table", { name: /Recent events/ });
      await expect(table).toBeVisible();
      await expect(table.getByRole("row")).toHaveCount(4); // header + 3 events
      await expect(table.getByRole("row").nth(1)).toContainText("Failed"); // newest first
      await expect(page.getByText("dev-ada")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `devices overflow @${width} ${theme}`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `docs/qa/devices-${width}-${theme}.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/devices");
  await page.getByLabel("Device id or custom id").fill("nobody-here");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.getByText("No device with that id.")).toBeVisible();
});
