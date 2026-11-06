import { decideUpdate, NO_UPDATE } from "@buffersol/hotrail-core";
import { describe, expect, it } from "vitest";
import { auditToCsv, collectAudit, csvCell } from "@/lib/audit-csv";
import { auditForAuthCall } from "@/lib/auth/audit-hook";
import { NONE } from "@/lib/billing/entitlement";
import { crossedThresholds, mauReport, OVERAGE_USD_PER_MAU, setOverageCapUsd } from "@/lib/billing/limits";
import { periodOf } from "@/lib/billing/usage";
import type { AuditEntry } from "@/lib/db/types";
import { cronJobs } from "@/lib/cron/jobs";
import { checkUpdate } from "@/lib/hotpath/check";
import { createNotifier, notifyScope, type Notifier } from "@/lib/notify";
import { ingestStats, storePointerReader } from "@/lib/ship/device";
import { assertStorageWithin, limitsSweep, recordActiveDevice, syncOrgLimits } from "@/lib/ship/metering";
import { PUBLIC_PREFIXES } from "@/lib/ship/types";
import { writeZip } from "@/lib/ship/zip";
import { harness, ORG_A, type Harness } from "./helpers/ship";

const APP = "com.example.ordering";
const zipOf = (body: string, extra: Record<string, string> = {}) =>
  writeZip([{ path: "index.html", data: new TextEncoder().encode(`<html>${body}</html>`) }, ...Object.entries(extra).map(([path, d]) => ({ path, data: new TextEncoder().encode(d) }))]);

async function live(h: Harness, version = "1.0.0", extra: Record<string, string> = {}) {
  const up = await h.call("all", "POST", `bundles?appId=${APP}&version=${version}`, zipOf(version, extra));
  expect(up.status).toBe(201);
  expect((await h.call("all", "POST", "channels/release", { appId: APP, channel: "production", bundle: up.body.headcode, percent: 100 })).status).toBe(200);
  return up.body.headcode as string;
}
const ask = (h: Harness, device = "dev-x") => checkUpdate(storePointerReader(h.deps.store), { app_id: APP, device_id: device, platform: "ios", version_name: "builtin", version_build: "1" });
const paid = (h: Harness, plan: "solo" | "maker" = "solo") =>
  h.deps.db.setEntitlement(ORG_A, { ...NONE(1), isPaid: true, status: "active", plan, expiresAt: h.clock.now.getTime() + 30 * 864e5 });

interface Sent { to: string; subject: string; scope?: string; category?: string }
function recorder(h: Harness, members: string[] = ["owner@x.test", "dev@x.test"]) {
  const sent: Sent[] = [];
  const notify: Notifier = createNotifier({
    db: h.deps.db, baseUrl: "https://api.test",
    recipients: { owners: async () => [members[0]!], members: async () => members },
    send: async (m) => { sent.push({ to: m.to, subject: m.subject, scope: m.scope, category: m.category }); },
  });
  h.deps.notify = notify;
  return sent;
}
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((x) => x.toString(16).padStart(2, "0")).join("");

describe("MAU metering", () => {
  it("counts a device once per month, again in a new month, and ignores unknown apps", async () => {
    const h = harness(); await live(h);
    for (const d of ["a", "b", "a", "a"]) await recordActiveDevice(h.deps, APP, d);
    expect(await recordActiveDevice(h.deps, "com.nobody.app", "z")).toEqual({ counted: false });
    expect(await h.deps.db.getUsage(ORG_A, "mau", "2026-11")).toBe(2);
    h.clock.now = new Date("2026-12-01T00:00:01Z");
    await recordActiveDevice(h.deps, APP, "a");
    expect(await h.deps.db.getUsage(ORG_A, "mau", "2026-12")).toBe(1);
    expect(periodOf(h.clock.now)).toBe("2026-12");
  });

  it("emails the owner at 50, 70, 90 and 100% once each per period, not on repeats", async () => {
    const h = harness(); await live(h); const sent = recorder(h);
    for (let i = 0; i < 500; i++) await recordActiveDevice(h.deps, APP, `d${i}`);
    for (let i = 0; i < 500; i++) await recordActiveDevice(h.deps, APP, `d${i}`); // repeats count nothing
    expect(sent.map((s) => s.subject)).toEqual([
      "Your app is at 50% of 500 MAU", "Your app is at 70% of 500 MAU", "Your app is at 90% of 500 MAU", "Your app has reached 500 MAU",
    ]);
    expect(new Set(sent.map((s) => s.to))).toEqual(new Set(["owner@x.test"])); // owners only
    h.clock.now = new Date("2026-12-02T00:00:00Z"); // next period: the same thresholds can fire again
    for (let i = 0; i < 250; i++) await recordActiveDevice(h.deps, APP, `d${i}`);
    expect(sent).toHaveLength(5);
    expect(crossedThresholds(450, 500)).toEqual([50, 70, 90]);
  });

  it("at the limit new downloads pause (pointer limited) and resume on upgrade or the next month", async () => {
    const h = harness(); await live(h);
    for (let i = 0; i < 499; i++) await recordActiveDevice(h.deps, APP, `d${i}`);
    expect(await ask(h)).toMatchObject({ version: "1.0.0" });
    await recordActiveDevice(h.deps, APP, "d499");
    expect(await ask(h)).toEqual(NO_UPDATE);
    // plan change (what the Stripe webhook triggers): the pointers are republished with the new limit state
    await paid(h);
    await syncOrgLimits(h.deps, ORG_A);
    expect(await ask(h)).toMatchObject({ version: "1.0.0" });
    // back to free, still in the same month: limited again after a sync
    await h.deps.db.setEntitlement(ORG_A, NONE(1));
    await syncOrgLimits(h.deps, ORG_A);
    expect(await ask(h)).toEqual(NO_UPDATE);
    // month rollover is picked up by the cron sweep, with no device or webhook event
    h.clock.now = new Date("2026-12-01T00:05:00Z");
    expect(await limitsSweep(h.deps)).toMatchObject({ orgs: 1, changed: 1 });
    expect(await ask(h)).toMatchObject({ version: "1.0.0" });
    expect(cronJobs["limits-sweep"]).toBeTypeOf("function");
  });

  it("overage: reported at $0.0015 per extra MAU, paid plans only, and a cap keeps downloads running", async () => {
    const h = harness(); await live(h); await paid(h);
    await h.deps.db.incUsage(ORG_A, "mau", "2026-11", 1999);
    await recordActiveDevice(h.deps, APP, "x1"); // 2000: at the limit
    expect(await ask(h)).toEqual(NO_UPDATE);
    await setOverageCapUsd(h.deps.db, ORG_A, 15);
    await syncOrgLimits(h.deps, ORG_A);
    expect(await ask(h)).toMatchObject({ version: "1.0.0" });
    for (const d of ["x2", "x3"]) await recordActiveDevice(h.deps, APP, d);
    const r = await mauReport(h.deps.db, ORG_A, h.clock.now);
    expect(r).toMatchObject({ used: 2002, included: 2000, allowed: 2000 + 10000, billed: false, limited: false });
    expect(r.overageUsd).toBeCloseTo(2 * OVERAGE_USD_PER_MAU, 6);
    // Free never gets overage, even with a stored cap
    await h.deps.db.setEntitlement(ORG_A, NONE(1));
    expect((await mauReport(h.deps.db, ORG_A, h.clock.now)).allowed).toBe(500);
  });
});

describe("storage and retention", () => {
  it("refuses new uploads above the plan's storage and allows them below", async () => {
    const h = harness();
    await expect(assertStorageWithin(h.deps, ORG_A, 11 * 1024 ** 3)).rejects.toMatchObject({ status: 402 });
    await expect(assertStorageWithin(h.deps, ORG_A, 1024)).resolves.toBeUndefined();
    await paid(h);
    await expect(assertStorageWithin(h.deps, ORG_A, 11 * 1024 ** 3)).resolves.toBeUndefined(); // Solo has 100 GiB
  });

  it("stores raw events for as many days as the plan includes", async () => {
    const h = harness(); await live(h);
    await ingestStats(h.deps, { app_id: APP, device_id: "d1", version_name: "1.0.0", action: "set" });
    const appId = (await h.deps.db.listApps(ORG_A))[0]!.id;
    const free = (await h.deps.db.listEvents(appId)).find((e) => e.deviceId === "d1")!;
    expect(Math.round((free.expiresAt.getTime() - free.ts.getTime()) / 864e5)).toBe(7);
    await paid(h, "maker");
    await ingestStats(h.deps, { app_id: APP, device_id: "d2", version_name: "1.0.0", action: "set" });
    const maker = (await h.deps.db.listEvents(appId)).find((e) => e.deviceId === "d2")!;
    expect(Math.round((maker.expiresAt.getTime() - maker.ts.getTime()) / 864e5)).toBe(60);
  });
});

describe("delta delivery fields", () => {
  it("the check response offers manifest_url and files_url, and the blobs are public and present", async () => {
    const h = harness(); await live(h, "1.0.0", { "app.js": "console.log(1)" });
    const res = (await ask(h)) as Record<string, string>;
    expect(Object.keys(res).sort()).toEqual(["checksum", "files_url", "manifest_url", "url", "version"]);
    const mkey = new URL(res.manifest_url!).pathname.replace("/api/v1/files/", "");
    const m = JSON.parse(new TextDecoder().decode((await h.deps.store.get(mkey))!)) as { manifest: { files: { sha256: string }[] } };
    expect(m.manifest.files.length).toBe(2);
    for (const f of m.manifest.files) {
      const key = new URL(`${res.files_url}/${f.sha256}`).pathname.replace("/api/v1/files/", "");
      expect(PUBLIC_PREFIXES.some((p) => key.startsWith(p))).toBe(true);
      expect(await h.deps.store.has(key)).toBe(true);
    }
  });

  it("without the delta fields in the pointer the response is the plain zip shape", async () => {
    const base = { channelId: "c", bundleVersion: "1.0.0", url: "https://cdn/x.zip", checksum: "a".repeat(64), rolloutPercent: 100, paused: false };
    const req = { app_id: "a.b", device_id: "d", version_name: "0" };
    expect(await decideUpdate(base, req)).toEqual({ version: "1.0.0", url: base.url, checksum: base.checksum });
    expect(await decideUpdate({ ...base, manifestUrl: "https://cdn/m.json" }, req)).not.toHaveProperty("manifest_url"); // both or neither
    expect(await decideUpdate({ ...base, manifestUrl: "https://cdn/m.json", filesUrl: "https://cdn/f" }, req)).toMatchObject({ manifest_url: "https://cdn/m.json", files_url: "https://cdn/f" });
  });
});

describe("bundle delete removes stored files", () => {
  it("deletes the zip, manifest and blobs nobody else uses, and keeps shared blobs", async () => {
    const h = harness();
    const a = await live(h, "1.0.0", { "shared.js": "same", "only1.js": "one" });
    await live(h, "2.0.0", { "shared.js": "same", "only2.js": "two" });
    await live(h, "3.0.0", { "shared.js": "same" });
    const appDoc = (await h.deps.db.listApps(ORG_A))[0]!;
    const del = await h.call("all", "DELETE", `bundles?appId=${APP}&bundle=${a}`);
    expect(del.status).toBe(200);
    expect(del.body.filesDeleted).toBeGreaterThanOrEqual(3);
    expect(await h.deps.store.has(`blobs/${appDoc.id}/${await sha("one")}`)).toBe(false);
    expect(await h.deps.store.has(`blobs/${appDoc.id}/${await sha("same")}`)).toBe(true);
    expect(await h.deps.store.has(`blobs/${appDoc.id}/${await sha("two")}`)).toBe(true);
  });
});

describe("notifications", () => {
  it("release, rollback and auto-pause reach subscribed members; an unsubscribed kind is skipped", async () => {
    const h = harness(); const sent = recorder(h); await live(h);
    expect(sent.map((s) => s.to)).toEqual(["owner@x.test", "dev@x.test"]);
    expect(sent[0]).toMatchObject({ category: "notification", scope: notifyScope("release") });
    expect(sent[0]!.subject).toMatch(/^Released 1A00 to com\.example\.ordering \/ production/);
    await h.deps.db.addSuppression({ email: "dev@x.test", scope: notifyScope("rollback"), reason: "unsubscribe" });
    await live(h, "2.0.0");
    sent.length = 0;
    expect((await h.call("all", "POST", "channels/rollback", { appId: APP, channel: "production" })).status).toBe(200);
    expect(sent.map((s) => s.to)).toEqual(["owner@x.test"]);
    expect(sent[0]!.subject).toMatch(/^Rolled back /);
    sent.length = 0;
    for (let i = 0; i < 20; i++) await ingestStats(h.deps, { app_id: APP, device_id: `f${i}`, version_name: "1.0.0", action: i < 10 ? "set" : "download_fail" });
    const pauses = sent.filter((s) => s.scope === notifyScope("autopause"));
    expect(pauses.length).toBe(2);
    expect(pauses[0]!.subject).toMatch(/^Rollout of .* paused/);
  });

  it("a failing mail transport never breaks the release", async () => {
    const h = harness();
    h.deps.notify = createNotifier({ db: h.deps.db, baseUrl: "x", recipients: { owners: async () => ["a@x.test"], members: async () => ["a@x.test"] }, send: async () => { throw new Error("smtp down"); } });
    await live(h);
    expect(await ask(h)).toMatchObject({ version: "1.0.0" });
  });
});

describe("signed failure-spike event", () => {
  it("fires once at half the auto-pause threshold, before the pause, with a verifiable signature", async () => {
    const h = harness(); await live(h);
    const ep = await h.deps.db.createWebhookEndpoint({ id: "ep1", orgId: ORG_A, url: "https://hooks.test/in", secret: "whsec_t", events: ["channel.failure_spike", "channel.paused"], enabled: true });
    for (let i = 0; i < 39; i++) await ingestStats(h.deps, { app_id: APP, device_id: `a${i}`, version_name: "1.0.0", action: "set" });
    await ingestStats(h.deps, { app_id: APP, device_id: "bad", version_name: "1.0.0", action: "download_fail" }); // 1/40 = 2.5%
    await ingestStats(h.deps, { app_id: APP, device_id: "bad2", version_name: "1.0.0", action: "download_fail" }); // cooldown: no second spike
    const spikes = h.webhooks.filter((w) => w.headers["x-webhook-event"] === "channel.failure_spike");
    expect(spikes).toHaveLength(1);
    const body = JSON.parse(spikes[0]!.body) as { type: string; data: { rate: number; sample: number; threshold: number } };
    expect(body.type).toBe("channel.failure_spike");
    expect(body.data).toMatchObject({ sample: 40, threshold: 0.05 });
    const { verifySignature } = await import("@/lib/webhooks/outbound");
    expect(await verifySignature(ep.secret, spikes[0]!.body, spikes[0]!.headers["x-webhook-signature"]!, h.clock.now.getTime())).toBe(true);
    expect(h.webhooks.some((w) => w.headers["x-webhook-event"] === "channel.paused")).toBe(false);
  });
});

describe("audit log export", () => {
  const entry = (i: number, over: Partial<AuditEntry> = {}): AuditEntry => ({ id: `e${i}`, app: "hotrail", orgId: ORG_A, actorId: "user:1", action: "channel.released", target: "a:b", at: new Date(Date.UTC(2026, 10, 5, 12, 0, 0) - i * 1000), ...over });

  it("quotes cells and neutralises spreadsheet formulas", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    for (const v of ["+1", "-1", "@a", "\tx"]) expect(csvCell(v).replace(/^"/, "").startsWith("'")).toBe(true);
    expect(csvCell(null)).toBe("");
    const csv = auditToCsv([entry(0, { meta: { headcode: "1A00", percent: 50 }, ip: "1.2.3.4" }), entry(1, { actorId: null, target: null })]);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("time_utc,action,actor,target,ip,details");
    expect(lines[1]).toBe('2026-11-05T12:00:00.000Z,channel.released,user:1,a:b,1.2.3.4,"{""headcode"":""1A00"",""percent"":50}"');
    expect(lines[2]).toContain(",system,");
  });

  it("pages through the log, honours from/to and reports truncation", async () => {
    const all = Array.from({ length: 450 }, (_, i) => entry(i));
    const list = async (o: { limit: number; before?: Date }) => all.filter((e) => !o.before || e.at < o.before).slice(0, o.limit);
    expect((await collectAudit(list)).entries).toHaveLength(450);
    const capped = await collectAudit(list, { max: 300 });
    expect(capped.entries).toHaveLength(300);
    expect(capped.truncated).toBe(true);
    const from = new Date(Date.UTC(2026, 10, 5, 12, 0, 0) - 99_500);
    expect((await collectAudit(list, { from })).entries).toHaveLength(100);
    const to = new Date(Date.UTC(2026, 10, 5, 12, 0, 0) - 400_000);
    expect((await collectAudit(list, { to })).entries[0]!.id).toBe("e401");
  });

  it("key and member changes map to audit actions, release and rollback are already audited", async () => {
    expect(auditForAuthCall({ path: "/api-key/create", body: { name: "ci", organizationId: "o1" }, userId: "u1", activeOrgId: null })).toMatchObject({ orgId: "o1", action: "apikey.created", target: "ci", actorId: "user:u1" });
    expect(auditForAuthCall({ path: "/api-key/delete", body: { keyId: "k1" }, userId: "u1", activeOrgId: "o2" })).toMatchObject({ orgId: "o2", action: "apikey.deleted", target: "k1" });
    expect(auditForAuthCall({ path: "/organization/update-member-role", body: { memberId: "m1", role: "admin" }, userId: "u1", activeOrgId: "o2" })).toMatchObject({ action: "member.role_changed", meta: { role: "admin" } });
    expect(auditForAuthCall({ path: "/organization/remove-member", body: { memberIdOrEmail: "a@b.c" }, userId: null, activeOrgId: "o2" })).toMatchObject({ action: "member.removed", actorId: null });
    expect(auditForAuthCall({ path: "/sign-in/magic-link", body: {}, userId: "u1", activeOrgId: "o2" })).toBeNull();
    expect(auditForAuthCall({ path: "/api-key/create", body: {}, userId: "u1", activeOrgId: null })).toBeNull();
    const h = harness(); await live(h, "1.0.0"); await live(h, "2.0.0");
    await h.call("all", "POST", "channels/rollback", { appId: APP, channel: "production" });
    const actions = (await h.deps.db.listAudit(ORG_A, { limit: 50 })).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["channel.released", "channel.rolled_back", "bundle.uploaded"]));
  });
});

describe("mail scopes and docs", () => {
  it("per kind scope drives suppression and the one-click unsubscribe link", async () => {
    const { sendMail, unsubscribeToken } = await import("@/lib/mail");
    const { consoleTransport } = await import("@/lib/mail/transports");
    const { getDb } = await import("@/lib/db");
    const msg = { to: "pat@x.test", subject: "s", text: "t", category: "notification" as const, scope: "notify:release" };
    const r = await sendMail(msg, consoleTransport());
    expect(r.accepted).toBe(true);
    const { outbox } = await import("@/lib/mail/transports");
    const sent = outbox[outbox.length - 1]!;
    expect(sent.headers?.["List-Unsubscribe"]).toContain(encodeURIComponent("notify:release"));
    expect(sent.headers?.["List-Unsubscribe"]).toContain(await unsubscribeToken("pat@x.test", "notify:release"));
    expect((sent as { scope?: string }).scope).toBeUndefined(); // internal field never reaches the provider
    await (await getDb()).addSuppression({ email: "pat@x.test", scope: "notify:release", reason: "unsubscribe" });
    expect((await sendMail(msg, consoleTransport())).suppressed).toBe(true);
    expect((await sendMail({ ...msg, scope: "notify:rollback" }, consoleTransport())).accepted).toBe(true);
  });

  it("the docs set is complete and llms.txt lists every page", async () => {
    const { docs } = await import("@/content/docs");
    const slugs = docs.map((d) => d.slug);
    for (const s of ["quickstart", "migrating-from-capgo", "channels", "rollouts", "rollback", "signing", "cli", "plugin", "mcp", "webhooks", "limits"]) expect(slugs).toContain(s);
    expect(new Set(slugs).size).toBe(slugs.length);
    const { GET } = await import("@/app/llms.txt/route");
    const txt = await GET().text();
    for (const d of docs) expect(txt).toContain(`/docs/${d.slug}`);
  });
});
