import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildManifest, generateSigningKeyPair, signManifest } from "@buffersol/hotrail-core";
import { createMemoryDb } from "@/lib/db/memory";
import type { Db } from "@/lib/db/types";
import { clearPriceCache } from "@/lib/billing/catalog";
import { createCheckoutSession } from "@/lib/billing/checkout";
import { handleStripeWebhook } from "@/lib/billing/webhook";
import { sendMailSafe, sendMail } from "@/lib/mail";
import { resendTransport } from "@/lib/mail/transports";
import { cachedPointerReader } from "@/lib/ship/device";
import { planBundle } from "@/lib/ship/upload";
import { attemptDelivery, isPrivateIp, isSafeWebhookUrl } from "@/lib/webhooks/outbound";
import { event, fakeStripe } from "./fakes";
import { harness, ORG_A } from "./helpers/ship";

// Launch hardening: one test per fix (docs/REVIEW.md "Launch hardening").

describe("P1-15 first signing-key registration needs the all scope", () => {
  it("an upload-scoped key cannot register a public key; an all-scoped key can", async () => {
    const h = harness();
    const kp = await generateSigningKeyPair();
    const manifest = await buildManifest({ appId: "com.example.keyreg", version: "1.0.0", nativeFingerprint: "n", files: [{ path: "index.html", data: new TextEncoder().encode("x") }] });
    const signed = await signManifest(manifest, kp.privateKey);
    const input = { appId: "com.example.keyreg", version: "1.0.0", manifest, signature: signed.signature, publicKey: kp.publicKey };
    await expect(planBundle(h.deps, h.principals.upload!, input)).rejects.toMatchObject({ status: 403 });
    const app = await h.deps.db.getAppByBundleId("com.example.keyreg");
    expect(app?.signingPublicKey ?? null).toBeNull();
    await planBundle(h.deps, h.principals.all!, input);
    expect((await h.deps.db.getAppByBundleId("com.example.keyreg"))?.signingPublicKey).toBe(kp.publicKey);
    expect(ORG_A).toBeTruthy();
  });
});

describe("P1-16 webhook SSRF guard at send time", () => {
  it("classifies private, CGNAT, mapped and v6 addresses", () => {
    for (const ip of ["10.1.2.3", "127.0.0.1", "100.64.0.1", "100.127.255.1", "169.254.169.254", "172.20.0.1", "192.168.1.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) expect(isPrivateIp(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "100.128.0.1", "172.32.0.1", "2606:4700::1111"]) expect(isPrivateIp(ip), ip).toBe(false);
    expect(isSafeWebhookUrl("https://100.64.0.5/hook")).toBe(false);
  });

  it("does not call a host that resolves to a private address", async () => {
    const db = createMemoryDb("hotrail");
    const fetchFn = vi.fn(async () => new Response("ok"));
    const ep = { id: "e", orgId: "o", url: "https://rebind.example/h", secret: "s", events: ["*"], enabled: true };
    const d = { id: "d", app: "hotrail", orgId: "o", endpointId: "e", event: "x", payload: "{}", status: "pending" as const, attempts: 0, nextAttemptAt: new Date(), lastStatusCode: null, lastError: null, createdAt: new Date(), updatedAt: new Date(), expireAt: new Date() };
    await db.createDelivery(d);
    const r = await attemptDelivery(d, ep as never, { db, fetchFn: fetchFn as unknown as typeof fetch, resolveCheck: async () => false });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(r.lastError).toBe("blocked_address");
  });
});

describe("P1-17 pointer cache on the hot path", () => {
  it("reads the store once within the TTL, again after it, and never caches a failure", async () => {
    let t = 0;
    let calls = 0;
    let fail = true;
    const store = { get: async () => { calls++; if (fail) throw new Error("r2 down"); return new TextEncoder().encode('{"a":1}'); } };
    const r = cachedPointerReader(store as never, 3000, () => t);
    await expect(r.readJson("k")).rejects.toThrow();
    fail = false;
    await new Promise((x) => setTimeout(x, 0));
    expect(await r.readJson("k")).toEqual({ a: 1 });
    expect(await r.readJson("k")).toEqual({ a: 1 });
    expect(calls).toBe(2);
    t = 3001;
    await r.readJson("k");
    expect(calls).toBe(3);
  });
});

describe("Stripe webhook: hostile ordering and payloads", () => {
  let db: Db;
  let f: ReturnType<typeof fakeStripe>;
  const NOW = 1_800_000_000_000;
  const hook = (body: string) => handleStripeWebhook(body, "good", { stripe: f.stripe, db, secret: "whsec_x", now: () => NOW });
  const urls = { success: "https://app.test/ok", cancel: "https://app.test/no" };
  beforeEach(() => { db = createMemoryDb("hotrail"); f = fakeStripe(); clearPriceCache(); });
  const setup = async () => {
    await createCheckoutSession(f.stripe, db, { orgId: "org_1", email: "d@x.test", userId: "u" }, "maker", "month", urls);
    return (await db.getBillingAccount("org_1"))!.stripeCustomerId!;
  };
  const lifetimePi = (cus: string) => event("payment_intent.succeeded", { id: "pi_life", customer: cus, metadata: { app: "hotrail", mode: "lifetime", plan: "maker", lookup_key: "hotrail_maker_monthly" } });

  it("a refund that arrives BEFORE its payment_intent.succeeded never grants the lifetime plan", async () => {
    const cus = await setup();
    expect((await hook(event("charge.refunded", { customer: cus, refunded: true, payment_intent: "pi_life" }))).status).toBe(200);
    await hook(lifetimePi(cus));
    expect((await db.getEntitlement("org_1"))?.status).not.toBe("lifetime");
  });

  it("an event with no data object and an unknown event type both answer 200", async () => {
    await setup();
    expect((await hook(JSON.stringify({ id: "evt_x1", type: "customer.subscription.created", data: {} }))).status).toBe(200);
    const cus = (await db.getBillingAccount("org_1"))!.stripeCustomerId!;
    const r = await hook(event("price.created", { customer: cus }));
    expect(r.status).toBe(200);
  });
});

describe("mail provider rejection never fails the request", () => {
  const rejecting = (status: number) => resendTransport("re_key", (async () => new Response('{"message":"secret provider detail"}', { status })) as unknown as typeof fetch);
  it.each([422, 429, 500])("sendMailSafe swallows a %i from Resend and leaks nothing", async (status) => {
    const msg = { to: "bad@example.test", subject: "s", text: "t" };
    await expect(sendMail(msg, rejecting(status))).rejects.toThrow(); // the raw path does throw
    const r = await sendMailSafe(msg, rejecting(status));
    expect(r).toBeNull();
  });
  it("a network failure is swallowed too", async () => {
    const t = resendTransport("k", (async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch);
    expect(await sendMailSafe({ to: "a@b.test", subject: "s", text: "t" }, t)).toBeNull();
  });
});
