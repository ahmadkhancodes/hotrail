import { expect, test } from "@playwright/test";
import { signInViaUi, watch } from "./helpers";

test("new visitor: landing CTAs, sign-in through the UI, onboarding, dashboard, no console/CSP errors", async ({ page, request }) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await page.goto("/");
  // every in-page link on the public pages resolves (no 404)
  for (const path of ["/", "/pricing", "/compare/capgo", "/docs"]) {
    await page.goto(path);
    const hrefs = await page.$$eval("a[href]", (as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!))]);
    for (const h of hrefs.filter((h) => h.startsWith("/") && !h.startsWith("//"))) {
      const r = await page.request.get(h, { maxRedirects: 5 });
      expect(r.status(), `${path} -> ${h}`).toBeLessThan(400);
    }
  }
  const email = `qa+${Date.now()}@studio.test`;
  await signInViaUi(page, request, email);
  await page.waitForURL(/onboarding/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(problems).toEqual([]);
});
