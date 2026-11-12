import { expect, type Page, type APIRequestContext } from "@playwright/test";

/** Collects console errors, CSP violations, page errors and failed same-origin requests. */
export function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    // Vercel Analytics script only exists on Vercel; benign 404/MIME noise locally. Expected 4xx/5xx API answers are asserted by the specs themselves.
    if (/_vercel\/insights|Failed to load resource/.test(m.text())) return;
    if (m.type() === "error" || /content security policy|hydrat/i.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.origin === new URL(page.url() === "about:blank" ? r.url() : page.url()).origin && r.status() >= 500) problems.push(`5xx: ${r.status()} ${u.pathname}`);
  });
  return problems;
}

export async function signInViaUi(page: Page, request: APIRequestContext, email: string, opts: { org?: string } = {}) {
  // Better Auth limits sign-in to 3 per 10 s per IP; a rate-limited attempt shows a clear message, then we wait and retry.
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: /email me a sign-in link/i }).click();
    const sent = page.getByText(/check your inbox/i);
    const limited = page.getByRole("alert").filter({ hasText: /too many attempts/i });
    await expect(sent.or(limited)).toBeVisible();
    if (await sent.isVisible()) break;
    await page.waitForTimeout(12_000);
  }
  await expect(page.getByText(/check your inbox/i)).toBeVisible();
  const link = await magicLink(request, email);
  await page.goto(link);
  if (opts.org) {
    await page.waitForURL(/onboarding/);
    await page.getByLabel(/name/i).first().fill(opts.org);
    await page.getByRole("button", { name: /create|continue/i }).click();
    await page.waitForURL(/\/app/);
  }
  return link;
}

export async function magicLink(request: APIRequestContext, email: string): Promise<string> {
  let link: string | undefined;
  await expect.poll(async () => {
    const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
    link = /https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1)?.text ?? "")?.[0];
    return link;
  }, { timeout: 10_000 }).toBeTruthy();
  return link!;
}
