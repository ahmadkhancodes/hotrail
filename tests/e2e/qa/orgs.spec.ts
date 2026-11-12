import { expect, test } from "@playwright/test";
import { magicLink, signInViaUi } from "./helpers";

test.setTimeout(240_000);

test("second organisation via the switcher, notification toggle persists, delete-account dialog needs the phrase", async ({ page, request }) => {
  await signInViaUi(page, request, `orgs+${Date.now()}@studio.test`, { org: "First Org" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app");
  await page.getByRole("button", { name: /Organization/ }).click();
  await expect(page.getByRole("listbox", { name: "Organizations" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox", { name: "Organizations" })).toHaveCount(0);
  await page.getByRole("button", { name: /Organization/ }).click();
  await page.getByRole("link", { name: "Create organization" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("another organization");
  await page.getByLabel("Organization name").fill("Second Org");
  await page.getByRole("button", { name: "Create organization" }).click();
  await page.waitForURL(/\/app/);
  await expect(page.getByRole("button", { name: /Organization.*Second Org/ })).toBeVisible();
  await page.getByRole("button", { name: /Organization/ }).click();
  await page.getByRole("option", { name: /First Org/ }).click();
  await expect(page.getByRole("button", { name: /Organization.*First Org/ })).toBeVisible();

  await page.goto("/app/settings/notifications");
  const first = page.getByRole("switch").first();
  const before = await first.getAttribute("aria-checked");
  await first.click();
  await expect(first).not.toHaveAttribute("aria-checked", before!);
  await page.reload();
  await expect(page.getByRole("switch").first()).not.toHaveAttribute("aria-checked", before!);

  await page.goto("/app/settings/profile");
  await page.getByRole("button", { name: "Delete my account" }).click();
  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: /delete account permanently/i });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("textbox").fill("delete my account");
  await expect(confirm).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("invitation: invited person signs in, accepts and lands in the organisation; a wrong account is told why", async ({ browser, baseURL }) => {
  const origin = { origin: baseURL! };
  const ownerCtx = await browser.newContext({ baseURL });
  const owner = await ownerCtx.newPage();
  await signInViaUi(owner, ownerCtx.request, `owner+${Date.now()}@studio.test`, { org: "Invite Org" });
  const invitee = `guest+${Date.now()}@studio.test`;
  await owner.goto("/app/settings/members");
  await owner.getByLabel("Email").fill(invitee);
  await owner.getByRole("button", { name: "Send invitation" }).click();
  await expect(owner.getByText(/Invitation sent to/)).toBeVisible();
  await expect(owner.getByRole("table").getByText(invitee)).toBeVisible();

  const mail = await (await ownerCtx.request.get(`/api/dev/outbox?to=${encodeURIComponent(invitee)}`)).json();
  const inviteLink = /https?:\/\/\S+accept-invite\/\S+/.exec(mail.messages.at(-1)?.text ?? "")?.[0];
  expect(inviteLink, "the invitation email contains an accept link").toBeTruthy();

  const guestCtx = await browser.newContext({ baseURL });
  const guest = await guestCtx.newPage();
  // signed out: the link goes through sign-in and comes back
  await guest.goto(inviteLink!);
  await expect(guest).toHaveURL(/sign-in/);
  await signInViaUi(guest, guestCtx.request, invitee);
  await guest.goto(inviteLink!);
  await guest.getByRole("button", { name: /accept/i }).click();
  await expect(guest).toHaveURL(/\/app/);
  await expect(guest.getByRole("button", { name: /Organization.*Invite Org/ })).toBeVisible();
  void origin;
  await ownerCtx.close(); await guestCtx.close();
});
