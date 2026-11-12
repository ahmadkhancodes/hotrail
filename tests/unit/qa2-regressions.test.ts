import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { magicLinkEmail, inviteEmail, noticeEmail } from "@/lib/mail/templates";

describe("QA2 regressions", () => {
  it("the root error boundary loads the brand fonts (it replaces the root layout, so it must set the font variables itself)", () => {
    const src = readFileSync("src/app/global-error.tsx", "utf8");
    expect(src).toContain('from "./fonts"');
    expect(src).toMatch(/sans\.variable/);
    expect(src).toMatch(/display\.variable/);
  });
  it("e-mails use the cobalt system only", () => {
    const html = [magicLinkEmail("https://x.test/a").html, inviteEmail({ orgName: "O", inviter: "I", url: "https://x.test", role: "admin" }).html, noticeEmail({ title: "t", body: "b" }).html].join("");
    expect(html).toContain("#1546c9");
    expect(html).not.toMatch(/#ffd23f|#181818|#0e1012|Archivo|Plex|prefers-color-scheme/i);
  });
  it("selecting a channel or bundle scrolls the inspector into view below xl", () => {
    const src = readFileSync("src/app/app/line-view.tsx", "utf8");
    expect(src).toContain('id="bundle-inspector"');
    expect(src).toContain("scrollIntoView");
  });
  it("billing tells people who canceled checkout that nothing was charged", () => {
    expect(readFileSync("src/app/app/billing/billing-client.tsx", "utf8")).toContain("Checkout canceled");
  });
  it("the disabled Look up button says why", () => {
    expect(readFileSync("src/app/app/devices/device-lookup.tsx", "utf8")).toContain("Enter a device id or custom id first");
  });
});
