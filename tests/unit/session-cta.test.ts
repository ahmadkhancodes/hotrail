import { describe, expect, it } from "vitest";
import { planCta, sessionCta } from "@/lib/marketing/session-cta";

describe("marketing session labels", () => {
  const out = { href: "/sign-in", label: "Start free" };
  it("keeps the signed-out call to action until the session is known", () => {
    expect(sessionCta(null, out)).toEqual(out);
    expect(sessionCta(false, out)).toEqual(out);
  });
  it("sends signed-in visitors to the app", () => {
    expect(sessionCta(true, out)).toEqual({ href: "/app", label: "Open dashboard" });
  });
  it("plan buttons: signed out unchanged, Free opens the app, paid goes to billing", () => {
    const maker = { id: "maker", cta: "Choose Maker" };
    expect(planCta(false, maker, "/sign-in?plan=maker", "year")).toEqual({ href: "/sign-in?plan=maker", label: "Choose Maker" });
    expect(planCta(true, { id: "free", cta: "Start free" }, "/sign-in", "month")).toEqual({ href: "/app", label: "Open dashboard" });
    expect(planCta(true, maker, "/sign-in", "year")).toEqual({ href: "/app/billing?plan=maker&interval=year", label: "Choose Maker" });
  });
});
