import { expect, test } from "@playwright/test";

// End to end on the memory driver: magic link -> session -> org -> entitlement -> API key -> cron guard.
test("magic link sign-in, org, billing state, api key, cron guard", async ({ page, request, baseURL }) => {
  const email = `e2e+${Date.now()}@studio.test`;
  const origin = { origin: baseURL! };

  const start = await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: origin });
  expect(start.ok()).toBeTruthy();

  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  const link = /https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)?.[0];
  expect(link).toBeTruthy();
  await page.goto(link!);

  const session = await (await page.request.get("/api/auth/get-session")).json();
  expect(session.user.email).toBe(email);

  const org = await page.request.post("/api/auth/organization/create", { data: { name: "Harbor Studio", slug: `harbor-${Date.now()}` }, headers: origin });
  expect(org.ok()).toBeTruthy();
  const orgId = (await org.json()).id;
  await page.request.post("/api/auth/organization/set-active", { data: { organizationId: orgId }, headers: origin });

  const ent = await (await page.request.get("/api/billing/entitlement")).json();
  expect(ent.plan.id).toBe("free");

  // CSRF: a cookie-authenticated POST from a foreign origin is refused
  const csrf = await page.request.post("/api/billing/portal", { headers: { origin: "https://evil.test" } });
  expect(csrf.status()).toBe(403);

  // Stub mode: checkout without Stripe answers 503 billing_unavailable (calm UI notice), never 500
  const co = await page.request.post("/api/billing/checkout", { data: { plan: "maker", interval: "year" }, headers: origin });
  expect([200, 503]).toContain(co.status());

  const key = await page.request.post("/api/auth/api-key/create", { data: { name: "ci", organizationId: orgId }, headers: origin });
  expect(key.ok()).toBeTruthy();
  const apiKey = (await key.json()).key as string;
  const me = await request.get("/api/v1/me", { headers: { "x-api-key": apiKey } });
  expect(await me.json()).toEqual({ orgId });
  expect((await request.get("/api/v1/me", { headers: { "x-api-key": "nope" } })).status()).toBe(401);

  expect((await request.post("/api/cron/heartbeat")).status()).toBe(401);
  expect((await request.post("/api/cron/heartbeat", { headers: { authorization: "Bearer e2e-cron" } })).ok()).toBeTruthy();

  const exp = await page.request.get("/api/account/export");
  expect((await exp.json()).user.email).toBe(email);
});

test("public pages render with metadata and no horizontal overflow at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ["/", "/pricing", "/compare/capgo", "/docs", "/docs/quickstart", "/legal/privacy", "/sign-in"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("title")).not.toBeEmpty();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
  }
  expect((await page.goto("/nope-404"))?.status()).toBe(404);
  expect((await page.request.get("/api/health")).ok()).toBeTruthy();
  expect(await (await page.request.get("/llms.txt")).text()).toContain("Hotrail by BufferSol");
});

test("landing shows the release board, the init command and the dated Appflow note", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Fix your Capacitor app today");
  await expect(page.getByRole("figure", { name: /release board/i }).first()).toBeVisible();
  await expect(page.getByText("npx @buffersol/hotrail init").first()).toBeVisible();
  await expect(page.getByText("31 Dec 2027").first()).toBeVisible();
  await page.goto("/pricing");
  await expect(page.getByText("Talk to us").first()).toBeVisible();
  await page.goto("/compare/capgo");
  await expect(page.getByText(/Last checked 3 Nov 2026/)).toBeVisible();
  expect((await page.request.get("/compare/web3forms")).status()).toBe(404);
});
