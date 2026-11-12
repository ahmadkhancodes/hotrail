import { expect, test } from "@playwright/test";

// B11: words start muted (30% opacity), switch on one by one in reading order, and show at full colour under reduced motion.
const opacities = (page: import("@playwright/test").Page) =>
  page.$$eval(".kit-word", (ws) => ws.map((w) => Number(getComputedStyle(w).opacity)));

test("tagline words light up one at a time on scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  expect((await opacities(page)).every((o) => Math.abs(o - 0.3) < 0.01)).toBe(true);
  const y = await page.$eval(".kit-word", (w) => w.getBoundingClientRect().top + scrollY);
  await page.evaluate((t) => scrollTo(0, t - 900 * 0.7 + 70), y);
  await expect.poll(async () => (await opacities(page))[0]).toBe(1);
  const mid = await opacities(page);
  expect(mid[mid.length - 1]).toBeLessThan(0.5); // not the whole block at once
  for (let i = 1; i < mid.length; i++) expect(mid[i]!).toBeLessThanOrEqual(mid[i - 1]! + 0.01); // reading order
});

test("tagline is at full colour at once under reduced motion", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/");
  expect((await opacities(page)).every((o) => o === 1)).toBe(true);
  await ctx.close();
});
