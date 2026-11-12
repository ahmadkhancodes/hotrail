import { expect, test } from "@playwright/test";
import { signInViaUi } from "./helpers";

const header = (page: import("@playwright/test").Page) => page.getByRole("banner");

test("signed-out marketing pages show Sign in and Start free", async ({ page }) => {
  for (const path of ["/", "/pricing", "/docs"]) {
    await page.goto(path);
    await expect(header(page).getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(header(page).getByRole("link", { name: "Start free" })).toBeVisible();
    await expect(header(page).getByRole("link", { name: "Open dashboard" })).toHaveCount(0);
  }
});

test("signed-in visitors see Open dashboard and plan-aware pricing CTAs", async ({ page, request }) => {
  test.setTimeout(120_000);
  await signInViaUi(page, request, `marketing-${Date.now()}@example.com`);
  for (const path of ["/", "/pricing", "/docs"]) {
    await page.goto(path);
    const open = header(page).getByRole("link", { name: "Open dashboard" });
    await expect(open).toBeVisible();
    await expect(open).toHaveAttribute("href", "/app");
    await expect(header(page).getByRole("link", { name: "Sign in" })).toHaveCount(0);
    await expect(header(page).getByRole("link", { name: "Start free" })).toHaveCount(0);
  }
  await page.goto("/pricing");
  const free = page.locator("#pricing li").filter({ has: page.getByRole("heading", { name: "Free" }) });
  await expect(free.getByRole("link", { name: "Open dashboard" })).toHaveAttribute("href", "/app");
  await expect(page.getByRole("link", { name: "Start free" })).toHaveCount(0);
  const maker = page.locator("#pricing li").filter({ has: page.getByRole("heading", { name: "Maker" }) });
  await expect(maker.getByRole("link", { name: "Choose Maker" })).toHaveAttribute("href", /\/app\/billing\?plan=maker/);
  await page.goto("/");
  await expect(page.getByRole("main").getByRole("link", { name: "Open dashboard" }).first()).toBeVisible();
});
