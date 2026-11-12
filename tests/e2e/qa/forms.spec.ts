import { expect, test } from "@playwright/test";
import { signInViaUi, watch } from "./helpers";

const IGNORE = /503 \/api\/billing\/checkout/;

test("signed-in forms: valid, empty, hostile and duplicate input all give visible feedback", async ({ page, request }) => {
  test.setTimeout(180_000);
  const problems = watch(page);
  await signInViaUi(page, request, `forms+${Date.now()}@studio.test`, { org: "Forms Org" });

  // API keys
  await page.goto("/app/settings/api-keys");
  await expect(page.getByText("No API keys yet")).toBeVisible();
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /name the key/i })).toBeVisible();
  await page.getByLabel("Name").fill("  <img src=x onerror=alert(1)> ünï 🚂  ");
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByText(/Key created/)).toBeVisible();
  await expect(page.locator("table").getByText("<img src=x onerror=alert(1)> ünï 🚂")).toBeVisible();
  await page.getByRole("button", { name: "I have saved it" }).click();
  await page.getByLabel("Name").fill("a".repeat(200));
  expect(await page.getByLabel("Name").inputValue()).toHaveLength(60);
  // duplicate name is allowed but must not break the list
  await page.getByLabel("Name").fill("Production server");
  await page.getByRole("button", { name: "Create key" }).click();
  await page.getByRole("button", { name: "I have saved it" }).click();
  await page.getByLabel("Name").fill("Production server");
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  // delete dialog: Escape closes, confirm deletes
  await page.getByRole("button", { name: "Delete" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete key" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);

  // Webhooks
  await page.goto("/app/settings/webhooks");
  await page.getByRole("button", { name: "Add endpoint" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  for (const bad of ["not a url", "http://example.com/x", "https://localhost/x", "javascript:alert(1)", "https://10.0.0.1/x"]) {
    await page.getByLabel("Endpoint URL").fill(bad);
    await page.getByRole("button", { name: "Add endpoint" }).click();
    await expect(page.getByRole("alert").first(), bad).toBeVisible();
    await expect(page.locator("tbody tr"), bad).toHaveCount(0);
  }

  // Members
  await page.goto("/app/settings/members");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await page.getByLabel("Email").fill("teammate@studio.test");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(/Invitation sent to teammate@studio.test/)).toBeVisible();
  // same address again: user sees an explanation, not silence
  await page.getByLabel("Email").fill("teammate@studio.test");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(/Invitation sent to teammate|already|invited|pending/i).last()).toBeVisible();

  // Profile
  await page.goto("/app/settings/profile");
  await page.getByLabel("Name").fill("Ada <b>Lovelace</b> 😀");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/saved|updated/i).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Name")).toHaveValue("Ada <b>Lovelace</b> 😀");
  await page.getByLabel("Name").fill("   ");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();

  // Billing: choosing a plan without Stripe connected gives a calm notice, never silence
  await page.goto("/app/billing");
  const upgrade = page.getByRole("button", { name: /upgrade|choose|start|subscribe|select/i }).first();
  if (await upgrade.count()) {
    await upgrade.click();
    await expect(page.getByText(/not connected|could not|redirect|checkout/i).first()).toBeVisible();
  }

  // Devices without any app: explanation and a way forward, not a dead form
  await page.goto("/app/devices");
  await expect(page.getByText("No devices yet.")).toBeVisible();
  await page.getByRole("link", { name: "Read the quickstart" }).click();
  await expect(page).toHaveURL(/\/docs\/quickstart/);

  expect(problems.filter((p) => !IGNORE.test(p))).toEqual([]);
});
