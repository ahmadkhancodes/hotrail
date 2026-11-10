import { expect, test } from "@playwright/test";

// Dashboard smoke with DB_DRIVER=memory and BUNDLE_STORE=memory (playwright.config.ts): no page may show the error boundary.
test("every /app page renders without 'This page could not load'", async ({ page, request, baseURL }) => {
  const email = `smoke+${Date.now()}@studio.test`;
  const origin = { origin: baseURL! };
  await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: origin });
  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0]);
  const org = await page.request.post("/api/auth/organization/create", { data: { name: "Smoke Org", slug: `smoke-${Date.now()}` }, headers: origin });
  await page.request.post("/api/auth/organization/set-active", { data: { organizationId: (await org.json()).id }, headers: origin });

  for (const path of ["/app", "/app/devices", "/app/billing", "/app/settings/api-keys", "/app/settings/members", "/app/settings/notifications", "/app/settings/audit", "/app/settings/webhooks", "/app/settings/profile", "/app/settings/security"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main, body").first(), path).not.toBeEmpty();
    await expect(page.getByText("This page could not load"), path).toHaveCount(0);
  }
});
