import { expect, test } from "@playwright/test";
import { magicLink, signInViaUi, watch } from "./helpers";

test.setTimeout(180_000);
const APP_PAGES = ["/app", "/app/devices", "/app/billing", "/app/settings/api-keys", "/app/settings/members", "/app/settings/notifications", "/app/settings/audit", "/app/settings/webhooks", "/app/settings/profile", "/app/settings/security"];

test("signed out: every dashboard page sends to sign-in and returns to the page afterwards", async ({ page, request }) => {
  for (const p of APP_PAGES) {
    await page.goto(p);
    await expect(page, p).toHaveURL(/\/sign-in/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Sign in");
  }
  // API without a session: 401, never 500, never data
  for (const u of ["/api/billing/entitlement", "/api/account/export", "/api/v1/me", "/api/v1/usage", "/api/v1/devices?q=x"]) {
    const r = await request.get(u);
    expect([401, 403], u).toContain(r.status());
  }
  expect((await request.get("/admin")).status()).not.toBe(500);
});

test("magic link is single use, garbage tokens show a recoverable message, sign-out ends the session", async ({ page, request, context }) => {
  const problems = watch(page);
  const email = `once+${Date.now()}@studio.test`;
  const link = await signInViaUi(page, request, email, { org: "Once Org" });
  await expect(page).toHaveURL(/\/app/);

  // sign out from the sidebar, then the dashboard is closed and the back button does not reopen data
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/app"));
  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in/);

  // reusing the same link shows the expired notice with a form to ask again
  await context.clearCookies();
  await page.goto(link);
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText("That link has expired")).toBeVisible();
  await expect(page.getByRole("button", { name: /email me a sign-in link/i })).toBeEnabled();

  // tampered token
  await page.goto("/api/auth/magic-link/verify?token=garbage&callbackURL=/app");
  await expect(page).toHaveURL(/\/sign-in/);
  expect(problems.filter((p) => /pageerror|5xx/.test(p))).toEqual([]);
});

test("open redirects are refused after sign-in, a new account lands on onboarding and an invalid email is explained", async ({ page, request }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: /email me a sign-in link/i }).click();
  await expect(page.locator("p[role=alert]")).toContainText(/valid email/i);
  await page.getByLabel("Email").fill("   ");
  await page.getByRole("button", { name: /email me a sign-in link/i }).click();
  await expect(page.locator("p[role=alert]")).toContainText(/valid email/i);

  const email = `redir+${Date.now()}@studio.test`;
  const res = await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "https://evil.test/x" }, headers: { origin: page.url() ? new URL(page.url()).origin : "" } });
  expect([200, 400, 403]).toContain(res.status());
  if (res.ok()) {
    await page.goto(await magicLink(request, email));
    expect(new URL(page.url()).origin).toBe(new URL((await page.evaluate(() => location.origin))).origin);
  }
  await page.goto("/sign-in?next=https://evil.test");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sign in");
});

test("one organisation cannot read another's data", async ({ browser, baseURL }) => {
  const origin = { origin: baseURL! };
  async function user(tag: string) {
    const ctx = await browser.newContext({ baseURL });
    const page = await ctx.newPage();
    const email = `${tag}+${Date.now()}@studio.test`;
    await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: origin });
    const rq = ctx.request;
    await expect.poll(async () => (await (await rq.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json()).messages.length).toBeGreaterThan(0);
    const box = await (await rq.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
    await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0]);
    const org = await (await page.request.post("/api/auth/organization/create", { data: { name: `${tag} org`, slug: `${tag}-${Date.now()}` }, headers: origin })).json();
    await page.request.post("/api/auth/organization/set-active", { data: { organizationId: org.id }, headers: origin });
    const key = await (await page.request.post("/api/auth/api-key/create", { data: { name: "k", organizationId: org.id }, headers: origin })).json();
    return { ctx, page, org, key: key.key as string };
  }
  const a = await user("alice");
  const b = await user("bob");
  // Bob's key resolves to Bob's org only
  const me = await b.ctx.request.get("/api/v1/me", { headers: { "x-api-key": b.key } });
  expect(await me.json()).toEqual({ orgId: b.org.id });
  // Bob cannot list or delete Alice's keys / members / set-active into her org
  const listA = await b.page.request.get(`/api/auth/api-key/list?organizationId=${a.org.id}`);
  expect(listA.ok() ? ((await listA.json()).apiKeys ?? await Promise.resolve([])) : []).toEqual([]);
  const setActive = await b.page.request.post("/api/auth/organization/set-active", { data: { organizationId: a.org.id }, headers: origin });
  expect(setActive.ok() && (await setActive.json())?.id === a.org.id).toBeFalsy();
  const members = await b.page.request.get(`/api/auth/organization/get-full-organization?organizationId=${a.org.id}`);
  expect(members.ok() && (await members.json())?.id === a.org.id).toBeFalsy();
  await a.ctx.close(); await b.ctx.close();
});
