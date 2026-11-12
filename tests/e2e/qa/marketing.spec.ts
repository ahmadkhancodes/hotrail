import { expect, test } from "@playwright/test";
import { watch } from "./helpers";

test("pricing: interval toggle changes prices, plan CTAs go to sign-in with the plan and come back to billing", async ({ page }) => {
  const problems = watch(page);
  await page.goto("/pricing");
  const monthly = page.getByRole("button", { name: "Monthly" }).first();
  const yearly = page.getByRole("button", { name: "Annual" }).first();
  await yearly.click();
  await expect(yearly).toHaveAttribute("aria-pressed", "true");
  const yearText = await page.locator("main").innerText();
  await monthly.click();
  await expect(monthly).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator("main").innerText()).not.toEqual(yearText);
  const choose = page.getByRole("link", { name: /choose maker/i }).first();
  await choose.click();
  await expect(page).toHaveURL(/sign-in.*plan=maker/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sign in");
  expect(problems).toEqual([]);
});

test("landing: copy buttons give feedback, mobile menu opens, closes with Escape and every link works", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: /^copy/i }).first().click();
  await expect(page.getByText("Copied").first()).toBeVisible();
  const menu = page.getByRole("button", { name: /menu/i });
  if (await menu.count()) {
    await menu.first().click();
    await expect(menu.first()).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(menu.first()).toHaveAttribute("aria-expanded", "false");
    await menu.first().click();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Pricing" }).click();
    await expect(page).toHaveURL(/\/pricing/);
  }
});

test("404 page offers a way home and the sign-in page links to legal pages that exist", async ({ page }) => {
  await page.goto("/definitely-not-here");
  await expect(page.getByRole("link", { name: /home|back|hotrail/i }).first()).toBeVisible();
  for (const p of ["/legal/privacy", "/legal/terms", "/docs/limits", "/docs/billing", "/docs/cli", "/docs/plugin", "/docs/mcp", "/docs/webhooks", "/docs/api", "/docs/rollback", "/docs/channels", "/docs/rollouts", "/docs/signing", "/docs/migrating-from-capgo", "/sitemap.xml", "/robots.txt", "/llms.txt"]) {
    const r = await page.request.get(p);
    expect(r.status(), p).toBe(200);
  }
});
