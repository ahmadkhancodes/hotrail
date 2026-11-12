import { describe, expect, it } from "vitest";
import { allLookupKeys, planById, plans } from "@/config/product";
import { clearPriceCache } from "@/lib/billing/catalog";
import { checkoutReturnUrls, createCheckoutSession, createPortalSession, portalReturnUrl } from "@/lib/billing/checkout";
import { mauReport } from "@/lib/billing/limits";
import { handleStripeWebhook } from "@/lib/billing/webhook";
import { writeZip } from "@/lib/ship/zip";
import { event, fakeStripe } from "./fakes";
import { harness, ORG_A } from "./helpers/ship";

/**
 * The upgrade journey end to end, as far as Stripe test mode allows without card entry:
 * Free org hits a limit -> 402 names the plan and links to billing -> Checkout Session for the right
 * price lookup key, tagged metadata.app, with success and cancel URLs -> webhook activates the plan
 * and its limits -> portal link -> cancellation downgrades to Free limits again.
 */

const NOW = 1_800_000_000_000;
const zip = writeZip([{ path: "index.html", data: new TextEncoder().encode("<html>hi</html>") }]);

describe("upgrade journey", () => {
  it("limit -> checkout -> webhook lifts limits -> portal -> cancel brings Free limits back", async () => {
    clearPriceCache();
    const h = harness();
    const db = h.deps.db;
    const f = fakeStripe();
    const hook = (body: string) => handleStripeWebhook(body, "good", { stripe: f.stripe, db, secret: "whsec_x", now: () => NOW });
    const upload = (app: string) => h.call("all", "POST", `bundles?appId=${app}&version=1.0.0`, zip);

    // Day 7 on Free: the third app is refused with a reason and a link that preselects a plan.
    expect((await upload("com.acme.one")).status).toBe(201);
    expect((await upload("com.acme.two")).status).toBe(201);
    const limited = await upload("com.acme.three");
    expect(limited.status).toBe(402);
    expect(limited.body).toMatchObject({ error: "plan_limit", details: { limit: 2 } });
    expect(limited.body.hint).toContain("Solo ($6.99/mo) has unlimited apps");
    expect(limited.body.details.upgradeUrl).toBe(`${h.deps.baseUrl}/app/billing?plan=solo&interval=month`);
    expect((await mauReport(db, ORG_A)).included).toBe(planById("free")!.limits.mau);

    // Plan selection -> Checkout Session.
    const base = "https://hotrail.example";
    const urls = checkoutReturnUrls(base + "/");
    expect(urls).toEqual({ success: `${base}/app/billing?checkout=success`, cancel: `${base}/app/billing?checkout=canceled` });
    const r = await createCheckoutSession(f.stripe, db, { orgId: ORG_A, email: "alicia@agency.test", userId: "u_a" }, "maker", "month", urls);
    expect(r.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    const list = f.calls.find((c) => c.method === "prices.list");
    if (list) expect((list.args as { lookup_keys: string[] }).lookup_keys).toEqual(allLookupKeys());
    const session = f.calls.find((c) => c.method === "checkout.sessions.create")!.args as Record<string, any>;
    expect(session.line_items).toEqual([{ price: "price_maker_m", quantity: 1 }]); // the price whose lookup_key is hotrail_maker_monthly
    expect(session.subscription_data.metadata).toMatchObject({ app: "hotrail", plan: "maker", org_id: ORG_A });
    expect(session.success_url).toBe(`${base}/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
    expect(session.cancel_url).toBe(`${base}/app/billing?checkout=canceled`);
    expect(session.client_reference_id).toBe(ORG_A);

    // Stripe confirms -> webhook activates Maker and its limits.
    const cus = (await db.getBillingAccount(ORG_A))!.stripeCustomerId!;
    const sub = f.addSub(cus, "hotrail_maker_monthly");
    expect((await hook(event("checkout.session.completed", { customer: cus }))).status).toBe(200);
    expect(await db.getEntitlement(ORG_A)).toMatchObject({ isPaid: true, plan: "maker", status: "active" });
    expect((await upload("com.acme.three")).status).toBe(201);
    expect((await mauReport(db, ORG_A)).included).toBe(planById("maker")!.limits.mau);

    // Portal link returns to billing.
    const portal = await createPortalSession(f.stripe, db, ORG_A, portalReturnUrl(base));
    expect(portal.url).toContain("billing.stripe.test");
    expect(portalReturnUrl(base + "/")).toBe(`${base}/app/billing`);

    // Cancellation (portal or Stripe) -> back to Free limits; existing apps stay, new ones are refused again.
    sub.status = "canceled";
    expect((await hook(event("customer.subscription.deleted", { customer: cus }))).status).toBe(200);
    expect(await db.getEntitlement(ORG_A)).toMatchObject({ isPaid: false, plan: "free" });
    expect((await mauReport(db, ORG_A)).included).toBe(planById("free")!.limits.mau);
    expect((await upload("com.acme.four")).status).toBe(402);
    expect((await db.listApps(ORG_A)).length).toBe(3);
  });

  it("every paid price has an app-prefixed lookup key the setup script creates", () => {
    for (const p of plans) for (const x of p.prices) expect(x.lookupKey).toBe(`hotrail_${p.id}_${x.interval === "month" ? "monthly" : "annual"}`);
  });
});
