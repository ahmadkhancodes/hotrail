import { expect, test, type Page } from "@playwright/test";
import { signInViaUi, watch } from "../qa/helpers";
import { buildCli, capacitorProject, runSnippet } from "./cli";

/**
 * Persona walk-throughs (docs/QA-REPORT.md, "Usefulness pass 2"): real UI, real CLI process, real server.
 * Click budgets are asserted so first value cannot quietly get more expensive.
 */
test.setTimeout(240_000);
test.beforeAll(() => buildCli());

/** Counts clicks the user makes on the page, so a journey can be held to a budget. */
async function clickCounter(page: Page) {
  await page.exposeFunction("__hrClick", () => { counter.n++; });
  await page.addInitScript(() => document.addEventListener("click", () => (window as unknown as { __hrClick: () => void }).__hrClick(), true));
  const counter = { n: 0 };
  return counter;
}

async function setupSnippetFromDashboard(page: Page) {
  await page.goto("/app");
  await expect(page.getByText("No trains on this line yet.")).toBeVisible();
  await page.getByRole("button", { name: "Create a key and fill it in" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Your key is filled in above" })).toBeVisible();
  const snippet = (await page.getByLabel("Setup commands").innerText()).trim();
  expect(snippet).not.toContain("<create a key below>");
  return snippet;
}

test("Indie Ian, day 1: sign up to a live release in one dashboard click and three pasted commands", async ({ page, request, baseURL }) => {
  const problems = watch(page);
  const clicks = await clickCounter(page);
  await signInViaUi(page, request, `ian+${Date.now()}@indie.test`, { org: "Ian Apps" });
  const before = clicks.n;
  const snippet = await setupSnippetFromDashboard(page);
  expect(clicks.n - before, "clicks from empty dashboard to a runnable, personalised snippet").toBeLessThanOrEqual(1);
  expect(snippet).toContain(`export HOTRAIL_API_URL=${baseURL}`);
  expect(snippet).toMatch(/export HOTRAIL_API_KEY=\S{20,}/);

  const cwd = capacitorProject("com.indie.ordering", { version: "1.0.0" });
  const runs = runSnippet(snippet, cwd);
  expect(runs.map((r) => [r.line, r.status, r.stderr])).toEqual(runs.map((r) => [r.line, 0, ""]));
  const init = runs[0]!.stdout;
  expect(init).toContain(`appId: "com.indie.ordering"`); // paste-ready plugin setup, personalised
  expect(init).toContain(`updateUrl: "${baseURL}/api/v1/updates/check"`);
  expect(runs[1]!.stdout).toContain("Uploaded 1.0.0 as 1A00");
  expect(runs[2]!.stdout).toContain("Released 1A00 to production at 100%.");

  await page.goto("/app");
  await expect(page.getByText("1A00").first()).toBeVisible();
  await expect(page.getByText("production").first()).toBeVisible();
  expect(problems).toEqual([]);
});

test("Agency Alicia, day 2 and 7: second client app, then the Free limit points straight at a plan", async ({ page, request, baseURL }) => {
  await signInViaUi(page, request, `alicia+${Date.now()}@agency.test`, { org: "North Agency" });
  const snippet = await setupSnippetFromDashboard(page);
  // Day 1-2: two client apps from the same key, no extra setup per app.
  for (const app of ["com.client.bakery", "com.client.gym"]) {
    const runs = runSnippet(snippet, capacitorProject(app));
    expect(runs.every((r) => r.status === 0), runs.map((r) => r.stderr).join("\n")).toBe(true);
  }
  // Day 7: third client on Free. The CLI says why and where to go.
  const third = runSnippet(snippet, capacitorProject("com.client.florist"));
  const upload = third.find((r) => r.line.endsWith("upload"))!;
  expect(upload.status).toBe(1);
  const upgrade = `${baseURL}/app/billing?plan=solo&interval=month`;
  expect(upload.stderr).toContain("Error (402): plan_limit");
  expect(upload.stderr).toContain(`Solo ($6.99/mo) has unlimited apps. Upgrade: ${upgrade}`);

  // The link lands on billing with Solo picked; Stripe is not connected locally, so checkout answers with the calm notice.
  await page.goto(upgrade);
  await expect(page.getByText("Continue with Solo")).toBeVisible();
  await expect(page.getByText(/Solo, billed monthly: 2,000 monthly active users, Unlimited apps and members/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to checkout" })).toBeVisible();

  // The Line view shows both client apps as tabs.
  await page.goto("/app");
  await expect(page.getByRole("navigation", { name: "Apps" }).getByRole("link")).toHaveCount(2);
});

test("Platform Paul: Capgo migration, init prints the three URLs for this server and they answer the stock plugin", async ({ page, request, baseURL }) => {
  await signInViaUi(page, request, `paul+${Date.now()}@platform.test`, { org: "Paul Mobile" });
  const snippet = await setupSnippetFromDashboard(page);
  const cwd = capacitorProject("com.platform.retail", { version: "4.2.0", capgo: true });
  const runs = runSnippet(snippet, cwd);
  expect(runs.every((r) => r.status === 0), runs.map((r) => r.stderr).join("\n")).toBe(true);
  const init = runs[0]!.stdout;
  expect(init).toContain("Migration mode");
  const urls = [...init.matchAll(/(updateUrl|statsUrl|channelUrl): "([^"]+)"/g)].map((m) => [m[1], m[2]] as const);
  expect(urls.map(([k]) => k)).toEqual(["updateUrl", "statsUrl", "channelUrl"]);
  const device = { app_id: "com.platform.retail", device_id: "paul-device-1", version_name: "builtin", version_build: "42", version_code: "42", version_os: "17", platform: "ios", is_emulator: false, is_prod: true, plugin_version: "7.0.0", defaultChannel: "production" };
  const check = await request.post(urls[0]![1], { data: device });
  expect(check.status()).toBe(200);
  expect(await check.json()).toMatchObject({ version: "4.2.0" });
  expect((await request.post(urls[1]![1], { data: { ...device, action: "set", version_name: "4.2.0" } })).status()).toBe(200);
  expect((await request.get(`${urls[2]![1]}?app_id=com.platform.retail&device_id=paul-device-1&platform=ios`)).status()).toBeLessThan(500);
  expect(baseURL).toBeTruthy();
});
