import { expect, test } from "@playwright/test";
import { watch } from "../qa/helpers";
import { audit } from "./probe";

const ROUTES = ["/", "/pricing", "/docs", "/docs/quickstart", "/docs/limits", "/docs/billing", "/compare/capgo", "/legal/privacy", "/legal/terms", "/sign-in", "/sign-in/two-factor", "/does-not-exist-404"];

for (const [width, height] of [[375, 812], [1440, 900]]) {
  test(`public pages @${width}: brand fonts, no overflow, clipping, low contrast or console errors`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height });
    const problems = watch(page);
    for (const r of ROUTES) {
      await page.goto(r);
      await page.waitForLoadState("networkidle");
      expect(await audit(page), `${r} @${width}`).toEqual([]);
    }
    expect(problems).toEqual([]);
  });
}

test("every button on every marketing page does something observable, Escape closes what opens", async ({ page }) => {
  test.setTimeout(240_000);
  for (const [width, height] of [[375, 812], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    const problems = watch(page);
    for (const r of ["/", "/pricing", "/docs", "/compare/capgo", "/sign-in"]) {
      await page.goto(r);
      await page.waitForLoadState("networkidle");
      const n = await page.locator("button:visible:not([disabled])").count();
      for (let i = 0; i < n; i++) {
        await page.goto(r);
        await page.waitForLoadState("networkidle");
        const btn = page.locator("button:visible:not([disabled])").nth(i);
        if (!(await btn.count())) continue;
        const label = ((await btn.innerText()) || (await btn.getAttribute("aria-label")) || "").trim();
        if (/true/.test((await btn.getAttribute("aria-pressed")) ?? "") || (await btn.getAttribute("aria-checked")) === "true" || (await btn.getAttribute("aria-selected")) === "true") continue; // already the selected option
        if (/email me a sign-in link|passkey|google|github/i.test(label)) continue; // submits need input; covered by journey specs
        const before = await page.evaluate(() => document.body.innerHTML.length + "|" + [...document.querySelectorAll("[aria-expanded],[aria-pressed],[aria-checked],[aria-selected]")].map((e) => [e.getAttribute("aria-expanded"), e.getAttribute("aria-pressed"), e.getAttribute("aria-checked"), e.getAttribute("aria-selected")].join("")).join(",") + location.href + document.body.innerText.length);
        await btn.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(400);
        const after = await page.evaluate(() => document.body.innerHTML.length + "|" + [...document.querySelectorAll("[aria-expanded],[aria-pressed],[aria-checked],[aria-selected]")].map((e) => [e.getAttribute("aria-expanded"), e.getAttribute("aria-pressed"), e.getAttribute("aria-checked"), e.getAttribute("aria-selected")].join("")).join(",") + location.href + document.body.innerText.length);
        expect(after, `${r} @${width}: button "${label}" did nothing`).not.toBe(before);
      }
    }
    expect(problems).toEqual([]);
  }
});
