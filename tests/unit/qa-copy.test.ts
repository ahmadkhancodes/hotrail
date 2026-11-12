import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { plans } from "@/config/product";

describe("QA: numbers in copy come from the plan config", () => {
  it("device lookup does not hard-code an event retention that only holds for Free", () => {
    const src = readFileSync("src/app/app/devices/device-lookup.tsx", "utf8");
    expect(src).not.toMatch(/kept for 7 days/);
    expect(src).toContain("retentionDays");
  });
  it("the billing and pricing interval toggles use the same label", () => {
    expect(readFileSync("src/app/app/billing/billing-client.tsx", "utf8")).not.toContain('"Yearly"');
  });
  it("the Free plan copy matches the enforced app limit", async () => {
    const { FREE_APP_LIMIT } = await import("@/lib/ship/apps");
    expect(plans[0]!.highlights).toContain(`${FREE_APP_LIMIT} apps`);
  });
});

describe("QA: regressions found by the browser specs", () => {
  it("the dev outbox is shared across route bundles through globalThis", async () => {
    const { outbox } = await import("@/lib/mail/transports");
    expect((globalThis as { __hotrailOutbox?: unknown }).__hotrailOutbox).toBe(outbox);
  });
  it("API key names allow what the create-key field allows (60 characters)", () => {
    expect(readFileSync("src/lib/auth/index.ts", "utf8")).toContain("maximumNameLength: 60");
    expect(readFileSync("src/app/app/settings/api-keys/api-keys-client.tsx", "utf8")).toContain("maxLength={60}");
  });
  it("the magic-link verify navigation has its own roomy rate limit", () => {
    expect(readFileSync("src/lib/auth/index.ts", "utf8")).toContain('"/magic-link/verify"');
  });
});
