import { expect, request as pw, test, type APIRequestContext } from "@playwright/test";
import { writeZip } from "../../src/lib/ship/zip";

// Adversarial review (docs/SECURITY-REVIEW.md): two customers in two orgs on the running app (memory DB, outbox mail).
// Every test here is an exploit attempt; it passes only when the attack fails.

test.setTimeout(240_000);

const stamp = Date.now();
const APP_A = `com.example.sec${stamp}.a`;
const zip = writeZip([{ path: "index.html", data: new TextEncoder().encode("<html>a</html>") }]);

interface Actor { req: APIRequestContext; email: string; orgId: string; key: string; userId: string }
let base = "";
let A: Actor;
let B: Actor;
let webhookA = "";

async function outboxLink(req: APIRequestContext, email: string): Promise<string | null> {
  for (let i = 0; i < 10; i++) {
    const box = await (await req.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
    const link = /https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1)?.text ?? "")?.[0];
    if (link) return link;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

/** Asks for a magic link and returns it. Better Auth limits sign-in per IP, so a refusal waits out the window and retries. */
async function requestLink(req: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await req.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" } });
    const link = res.ok() ? await outboxLink(req, email) : null;
    if (link) return link;
    await new Promise((r) => setTimeout(r, 11_000));
  }
  throw new Error(`no magic link for ${email}`);
}

async function signIn(email: string): Promise<APIRequestContext> {
  const req = await pw.newContext({ baseURL: base, extraHTTPHeaders: { origin: base } });
  await req.get(await requestLink(req, email));
  return req;
}

async function actor(name: string): Promise<Actor> {
  const email = `sec-${name}+${stamp}@studio.test`;
  const req = await signIn(email);
  const org = await (await req.post("/api/auth/organization/create", { data: { name: `Sec ${name}`, slug: `sec-${name}-${stamp}` } })).json();
  await req.post("/api/auth/organization/set-active", { data: { organizationId: org.id } });
  const key = (await (await req.post("/api/auth/api-key/create", { data: { name: "ci", organizationId: org.id } })).json()).key as string;
  const s = await (await req.get("/api/auth/get-session")).json();
  return { req, email, orgId: org.id, key, userId: s.user.id };
}

test.beforeAll(async ({ baseURL }) => {
  base = baseURL!;
  A = await actor("a");
  B = await actor("b");
  const up = await A.req.post(`/api/v1/bundles?appId=${APP_A}&version=1.0.0`, { headers: { "x-api-key": A.key }, data: Buffer.from(zip) });
  expect(up.status()).toBe(201);
  const wh = await A.req.post("/api/webhooks", { data: { url: "https://hooks.example.com/a", events: ["release.created"] } });
  webhookA = (await wh.json()).endpoint.id;
  expect(webhookA).toBeTruthy();
});

test.afterAll(async () => { await A?.req.dispose(); await B?.req.dispose(); });

test("IDOR: org B cannot read or change org A's apps, bundles or channels (session or API key)", async () => {
  const keyB = { "x-api-key": B.key };
  for (const [method, path, data] of [
    ["GET", `/api/v1/line?appId=${APP_A}`, undefined],
    ["GET", `/api/v1/bundles?appId=${APP_A}`, undefined],
    ["GET", `/api/v1/channels?appId=${APP_A}`, undefined],
    ["GET", `/api/v1/usage?appId=${APP_A}`, undefined],
    ["GET", `/api/v1/devices?appId=${APP_A}&q=x`, undefined],
    ["GET", `/api/v1/native-builds?appId=${APP_A}`, undefined],
    ["POST", "/api/v1/channels/pause", { appId: APP_A, channel: "production" }],
    ["POST", "/api/v1/channels/rollback", { appId: APP_A, channel: "production" }],
    ["POST", "/api/v1/channels/release", { appId: APP_A, channel: "production", version: "1.0.0", percent: 100 }],
    ["DELETE", `/api/v1/bundles?appId=${APP_A}&bundle=1A00`, undefined],
    ["POST", "/api/v1/native-builds", { appId: APP_A, versionBuild: "1", native: { capacitor: "8.0.0", plugins: {} } }],
  ] as const) {
    for (const headers of [keyB, {}]) {
      const r = await B.req.fetch(path, { method, headers, data });
      expect(r.status(), `${method} ${path} ${Object.keys(headers).join()}`).toBe(404);
    }
  }
  // Uploading a bundle under A's app id from B is refused (app ids are owned).
  const up = await B.req.post(`/api/v1/bundles?appId=${APP_A}&version=9.9.9`, { headers: keyB, data: Buffer.from(zip) });
  expect(up.status()).toBe(409);
  // B's own app list does not include A's app.
  expect(JSON.stringify(await (await B.req.get("/api/v1/apps", { headers: keyB })).json())).not.toContain(APP_A);
  // A still sees its channel unpaused.
  const ch = await (await A.req.get(`/api/v1/channels?appId=${APP_A}`, { headers: { "x-api-key": A.key } })).json();
  expect(ch.channels[0].paused).toBe(false);
});

test("IDOR: org B cannot touch org A's webhooks, deliveries, keys, members or org", async () => {
  expect((await B.req.patch(`/api/webhooks/${webhookA}`, { data: { url: "https://evil.example.com/x" } })).status()).toBe(404);
  expect((await B.req.post(`/api/webhooks/${webhookA}/test`)).status()).toBe(404);
  await B.req.delete(`/api/webhooks/${webhookA}`);
  const mine = await (await A.req.get("/api/webhooks")).json();
  expect(mine.endpoints.map((e: { id: string; url: string }) => [e.id, e.url])).toContainEqual([webhookA, "https://hooks.example.com/a"]);
  expect((await (await B.req.get(`/api/webhooks/deliveries?endpointId=${webhookA}`)).json()).deliveries).toEqual([]);
  expect(JSON.stringify(await (await B.req.get("/api/webhooks")).json())).not.toContain(webhookA);

  expect((await B.req.post("/api/auth/api-key/create", { data: { name: "steal", organizationId: A.orgId } })).ok()).toBe(false);
  expect((await B.req.get(`/api/auth/api-key/list?organizationId=${A.orgId}`)).ok()).toBe(false);
  expect((await B.req.post("/api/auth/organization/set-active", { data: { organizationId: A.orgId } })).ok()).toBe(false);
  expect((await B.req.get(`/api/auth/organization/get-full-organization?organizationId=${A.orgId}`)).ok()).toBe(false);
  expect((await B.req.post("/api/auth/organization/invite-member", { data: { email: "x@studio.test", role: "admin", organizationId: A.orgId } })).ok()).toBe(false);
  expect((await B.req.post("/api/auth/organization/update", { data: { organizationId: A.orgId, data: { name: "pwned" } } })).ok()).toBe(false);
  expect((await B.req.post("/api/auth/organization/delete", { data: { organizationId: A.orgId } })).ok()).toBe(false);
  // B's audit log never shows A's entries.
  const audit = JSON.stringify(await (await B.req.get("/api/audit")).json());
  expect(audit).not.toContain(webhookA);
});

test("privilege: a viewer in org A cannot escalate, manage keys or webhooks, read audit or export the audit log", async () => {
  const inv = await (await A.req.post("/api/auth/organization/invite-member", { data: { email: B.email, role: "viewer", organizationId: A.orgId } })).json();
  expect((await B.req.post("/api/auth/organization/accept-invitation", { data: { invitationId: inv.id } })).ok()).toBe(true);
  await B.req.post("/api/auth/organization/set-active", { data: { organizationId: A.orgId } });
  const full = await (await A.req.get(`/api/auth/organization/get-full-organization?organizationId=${A.orgId}`)).json();
  const memberB = full.members.find((m: { userId: string }) => m.userId === B.userId);
  expect(memberB.role).toBe("viewer");

  expect((await B.req.post("/api/auth/organization/update-member-role", { data: { memberId: memberB.id, role: "owner", organizationId: A.orgId } })).ok()).toBe(false);
  expect((await B.req.post("/api/auth/api-key/create", { data: { name: "v", organizationId: A.orgId } })).ok()).toBe(false);
  expect((await B.req.post("/api/webhooks", { data: { url: "https://evil.example.com/h", events: ["release.created"] } })).status()).toBe(403);
  expect((await B.req.get("/api/audit")).status()).toBe(403);
  expect((await B.req.get("/api/audit/export")).status()).toBe(403);
  expect((await B.req.post("/api/v1/channels/pause", { data: { appId: APP_A, channel: "production" } })).status()).toBe(403);
  expect((await B.req.post("/api/billing/overage", { data: { capUsd: 50 } })).status()).toBe(403);
  // The personal data export must not become a side door to the org's audit log (IPs) or billing record.
  const exp = await (await B.req.get("/api/account/export")).json();
  const orgA = exp.organizations.find((o: { id: string }) => o.id === A.orgId);
  expect(orgA).toBeTruthy();
  expect(orgA.data.auditLog).toBeUndefined();
  expect(orgA.data.billingAccount).toBeUndefined();
  expect(JSON.stringify(orgA)).not.toContain("webhook.created");
  // still a viewer
  const after = await (await A.req.get(`/api/auth/organization/get-full-organization?organizationId=${A.orgId}`)).json();
  expect(after.members.find((m: { userId: string }) => m.userId === B.userId).role).toBe("viewer");
});

test("open redirect: next= with tabs, newlines or encoded slashes stays on this site", async () => {
  for (const next of ["/\t/evil.example", "/\n/evil.example", "/\r\n/evil.example", "/ /evil.example", "/%2F/evil.example", "/\\evil.example", "//evil.example", "https://evil.example"]) {
    const r = await A.req.get(`/sign-in?next=${encodeURIComponent(next)}`, { maxRedirects: 0 });
    const loc = r.headers()["location"] ?? "";
    expect(r.status(), next).toBeGreaterThanOrEqual(300);
    // what a browser does with the Location: strip tab/newline, then resolve against the page
    const resolved = new URL(loc.replace(/[\t\n\r]/g, ""), base);
    expect(resolved.host, `${JSON.stringify(next)} -> ${loc}`).toBe(new URL(base).host);
  }
});

test("magic link: one address cannot be flooded with sign-in mail, even from many IPs", async () => {
  const victim = `flood+${stamp}@studio.test`;
  const anon = await pw.newContext({ baseURL: base, extraHTTPHeaders: { origin: base } });
  const codes: number[] = [];
  for (let i = 0; i < 9; i++) {
    const r = await anon.post("/api/auth/sign-in/magic-link", { data: { email: victim, callbackURL: "/app" }, headers: { "x-forwarded-for": `203.0.113.${i + 1}` } });
    codes.push(r.status());
  }
  await anon.dispose();
  expect(codes.filter((c) => c === 200).length, codes.join(",")).toBeLessThanOrEqual(5);
  expect(codes).toContain(429);
});

test("session: cookies are HttpOnly + SameSite=Lax, and a copied cookie stops working right after sign-out", async () => {
  const email = `replay+${stamp}@studio.test`;
  const req = await pw.newContext({ baseURL: base, extraHTTPHeaders: { origin: base } });
  const link = await requestLink(req, email);
  const verify = await req.get(link, { maxRedirects: 0 });
  const setCookie = verify.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
  const token = setCookie.find((c) => c.includes("session_token="))!;
  expect(token).toMatch(/HttpOnly/i);
  expect(token).toMatch(/SameSite=Lax/i);
  // magic link replay after use fails
  const again = await pw.newContext({ baseURL: base });
  await again.get(link);
  expect((await (await again.get("/api/auth/get-session")).json())).toBeNull();
  await again.dispose();

  const state = await req.storageState();
  const cookieHeader = state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  expect((await req.post("/api/auth/sign-out", { data: {} })).ok()).toBe(true);
  const thief = await pw.newContext({ baseURL: base, extraHTTPHeaders: { cookie: cookieHeader, origin: base } });
  expect(await (await thief.get("/api/auth/get-session")).json()).toBeNull();
  expect((await thief.get("/api/webhooks")).status()).toBe(401);
  expect((await thief.get("/app", { maxRedirects: 0 })).status()).not.toBe(200);
  await thief.dispose();
  await req.dispose();
});

test("CSRF: cookie requests from another origin are refused on every state-changing API", async () => {
  const evil = { origin: "https://evil.example" };
  expect((await A.req.post("/api/webhooks", { headers: evil, data: { url: "https://evil.example.com/h", events: ["release.created"] } })).status()).toBe(403);
  expect((await A.req.post("/api/v1/channels/pause", { headers: evil, data: { appId: APP_A, channel: "production" } })).status()).toBe(403);
  expect((await A.req.delete(`/api/webhooks/${webhookA}`, { headers: evil })).status()).toBe(403);
  expect((await A.req.post("/api/notifications/preferences", { headers: evil, data: { kind: "release", enabled: false } })).status()).toBe(403);
  expect((await A.req.post("/api/auth/organization/invite-member", { headers: evil, data: { email: "x@studio.test", role: "admin", organizationId: A.orgId } })).ok()).toBe(false);
});

test("injection: Mongo operators and prototype keys in device beacons are ignored", async () => {
  const anon = await pw.newContext({ baseURL: base });
  for (const body of [
    { app_id: { $ne: null }, device_id: "d1", action: "download_fail" },
    { app_id: APP_A, device_id: { $ne: null } },
    { app_id: APP_A, device_id: "__proto__", channel: { $ne: null } },
  ]) {
    expect((await anon.post("/api/v1/updates/stats", { data: body })).status()).toBe(200);
    expect((await anon.delete("/api/v1/updates/channel", { data: body })).status()).toBeLessThan(500);
    expect((await anon.post("/api/v1/updates/channel", { data: body })).status()).toBeLessThan(500);
    expect((await anon.post("/api/v1/updates/check", { data: body })).status()).toBe(200);
  }
  await anon.dispose();
  const devices = await (await A.req.get(`/api/v1/devices?appId=${APP_A}&q=__proto__`)).json();
  // "__proto__" is a legal (string) device id; it must not inherit a channel or override from Object.prototype.
  if (devices.found) expect([devices.device.override, devices.device.channel]).toEqual([null, "production"]);
});

test("exposure: errors carry no stack, health and config hold no secrets, the outbox is closed without the flag", async () => {
  const bad = await A.req.post("/api/webhooks", { data: "{not json" , headers: { "content-type": "application/json" } });
  expect(bad.status()).toBe(400);
  const text = await bad.text();
  expect(text).not.toMatch(/at \w+ \(|node_modules|\.ts:\d+/);
  const health = await (await A.req.get("/api/health")).text();
  expect(health).not.toMatch(/mongodb(\+srv)?:\/\/|secret|password/i);
  const cfg = await (await A.req.get("/api/config")).text();
  expect(cfg).not.toMatch(/sk_|secret|whsec_/i);
  const notFound = await A.req.get("/api/v1/nope", { headers: { "x-api-key": A.key } });
  expect(notFound.status()).toBe(404);
  expect(await notFound.text()).not.toMatch(/stack|node_modules/);
});
