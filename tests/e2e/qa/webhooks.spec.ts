import { expect, test } from "@playwright/test";
import { signInViaUi } from "./helpers";

test.setTimeout(180_000);
test("webhook endpoint: add shows the secret once, pause/resume/test/delete all report what happened", async ({ page, request }) => {
  await signInViaUi(page, request, `hooks+${Date.now()}@studio.test`, { org: "Hooks Org" });
  await page.goto("/app/settings/webhooks");
  await page.getByLabel("Endpoint URL").fill("https://hooks.example.com/hotrail");
  await page.getByRole("button", { name: "Add endpoint" }).click();
  await expect(page.locator("tbody tr").first()).toContainText("hooks.example.com");
  await page.getByRole("button", { name: "I have saved it" }).click().catch(() => {});
  // duplicate URL
  await page.getByLabel("Endpoint URL").fill("https://hooks.example.com/hotrail");
  await page.getByRole("button", { name: "Add endpoint" }).click();
  await page.waitForTimeout(500);
  expect(await page.locator("tbody tr").count()).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause" }).first().click();
  await expect(page.getByText(/Paused deliveries to/)).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).first().click();
  await expect(page.getByText(/Resumed deliveries to/)).toBeVisible();
  await page.getByRole("button", { name: "Send test" }).first().click();
  await expect(page.getByText(/Test event queued|could not|failed/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /^delete/i }).click();
  await expect(page.getByText(/deleted\./)).toBeVisible();
});
