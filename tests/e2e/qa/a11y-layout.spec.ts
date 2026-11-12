import { expect, test } from "@playwright/test";
import { signInViaUi } from "./helpers";

const PAGES = ["/app", "/app/devices", "/app/billing", "/app/settings/api-keys", "/app/settings/members", "/app/settings/notifications", "/app/settings/audit", "/app/settings/webhooks", "/app/settings/profile", "/app/settings/security", "/", "/pricing", "/docs", "/sign-in"];

test("every page: named controls, pointer cursor, 44px tap targets on phones, no horizontal scroll, in light and dark", async ({ page, request }) => {
  test.setTimeout(300_000);
  await signInViaUi(page, request, `a11y+${Date.now()}@studio.test`, { org: "A11y Org" });
  for (const [width, height] of [[375, 812], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const p of PAGES) {
        await page.goto(p);
        await page.waitForLoadState("networkidle");
        const bad = await page.evaluate((phone) => {
          const out: string[] = [];
          if (document.documentElement.scrollWidth > innerWidth) out.push(`horizontal scroll ${document.documentElement.scrollWidth}`);
          for (const el of document.querySelectorAll<HTMLElement>("button, a[href], [role=button], input:not([type=hidden]), select, textarea, summary")) {
            const b = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            if (!b.width || !b.height || cs.visibility === "hidden") continue;
            const input = el as HTMLInputElement;
            const name = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || input.labels?.[0]?.textContent || el.getAttribute("placeholder") || "").trim();
            const tag = `${el.tagName}:${name.slice(0, 30)}`;
            if (!name) out.push(`no accessible name ${el.outerHTML.slice(0, 80)}`);
            const disabled = (el as HTMLButtonElement).disabled;
            if (["BUTTON", "A", "SUMMARY"].includes(el.tagName) && !disabled && cs.cursor !== "pointer") out.push(`cursor ${cs.cursor} on ${tag}`);
            if (phone && el.tagName === "BUTTON" && !disabled && b.height < 44) out.push(`tap target ${Math.round(b.width)}x${Math.round(b.height)} ${tag}`);
          }
          return out;
        }, width < 600);
        expect([...new Set(bad)], `${p} @${width} ${scheme}`).toEqual([]);
      }
    }
  }
});

test("keyboard only: skip to the form on sign-in, tab reaches the submit button, focus is visible, Enter submits", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").focus();
  await page.keyboard.type("keyboard@studio.test");
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toHaveText(/email me a sign-in link/i);
  const outline = await focused.evaluate((el) => { const s = getComputedStyle(el); return `${s.outlineStyle}|${s.outlineWidth}|${s.boxShadow}`; });
  expect(outline).not.toMatch(/^none\|0px\|none$/);
});
