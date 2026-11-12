import { describe, expect, it, vi } from "vitest";
import { orgExportFor } from "@/lib/account-export";
import { emailLimitFor } from "@/lib/auth/email-limit";
import { safeNext, afterSignIn } from "@/components/app/redirect";
import { createMemoryDb } from "@/lib/db/memory";
import type { Db } from "@/lib/db/types";
import { resolveChannel, checkUpdate } from "@/lib/hotpath/check";
import { safeSubject } from "@/lib/mail";
import { consoleTransport } from "@/lib/mail/transports";
import { log } from "@/lib/logger";
import { clearDeviceChannel, getDeviceChannel, ingestStats, selfAssignChannel } from "@/lib/ship/device";
import { recordActiveDevice } from "@/lib/ship/metering";
import { writeZip } from "@/lib/ship/zip";
import { harness, type Harness } from "./helpers/ship";

// Regression tests for docs/SECURITY-REVIEW.md. Each one is the exploit; it failed on the code before the fix.

const APP = "com.example.victim";

async function victim(): Promise<Harness> {
  const h = harness();
  const zip = writeZip([{ path: "index.html", data: new TextEncoder().encode("<html>v</html>") }]);
  expect((await h.call("all", "POST", `bundles?appId=${APP}&version=1.0.0`, zip)).status).toBe(201);
  return h;
}

/** Records every argument the device code hands to the DB. Mongo would read an object argument as a query operator. */
function spyDb(db: Db): { db: Db; nonStrings: string[] } {
  const nonStrings: string[] = [];
  const watched = ["getAppByBundleId", "getChannelByName", "getOverride", "deleteOverride", "getDevice", "getDeviceByCustomId", "markActiveDevice"];
  const proxy = new Proxy(db, {
    get(target, prop, recv) {
      const v = Reflect.get(target, prop, recv);
      if (typeof v !== "function" || !watched.includes(String(prop))) return v;
      return (...args: unknown[]) => {
        args.forEach((a, i) => { if (a !== undefined && typeof a !== "string" && typeof a !== "number" && !(prop === "markActiveDevice" && i === 0)) nonStrings.push(`${String(prop)}#${i}`); });
        return v.apply(target, args);
      };
    },
  });
  return { db: proxy, nonStrings };
}

describe("S-1 NoSQL operator injection on the unauthenticated device endpoints", () => {
  const evil = { $regex: "^com\\.victim" } as unknown as string;
  it("operator objects in app_id, device_id or channel never reach the database", async () => {
    const h = await victim();
    const { db, nonStrings } = spyDb(h.deps.db);
    const deps = { ...h.deps, db };
    await ingestStats(deps, { app_id: evil, device_id: "d1", action: "download_fail" });
    await ingestStats(deps, { app_id: APP, device_id: { $ne: null } as unknown as string, action: "download_fail" });
    await getDeviceChannel(deps, { app_id: evil, device_id: "d1" });
    await selfAssignChannel(deps, { app_id: evil, device_id: "d1", channel: { $ne: null } as unknown as string }).catch(() => null);
    await selfAssignChannel(deps, { app_id: APP, device_id: "d1", channel: { $ne: null } as unknown as string }).catch(() => null);
    await clearDeviceChannel(deps, { app_id: evil, device_id: { $ne: null } as unknown as string }).catch(() => null);
    await clearDeviceChannel(deps, { app_id: APP, device_id: { $ne: null } as unknown as string }).catch(() => null);
    await recordActiveDevice(deps, evil, "d1");
    expect(nonStrings).toEqual([]);
  });

  it("type confusion in other beacon fields is dropped, valid beacons still count", async () => {
    const h = await victim();
    await ingestStats(h.deps, { app_id: APP, device_id: "d2", platform: { $gt: "" } as unknown as string, version_name: ["x"] as unknown as string, action: "set" });
    const app = (await h.deps.db.getAppByBundleId(APP))!;
    const d = await h.deps.db.getDevice(app.id, "d2");
    expect(d?.platform).toBe("unknown");
    expect(d?.bundleVersion).toBeNull();
  });

  it("a device id of __proto__ or constructor does not resolve to an Object.prototype member", async () => {
    const reader = { readJson: async <T,>() => ({ v: 1, defaults: {}, overrides: {} }) as T };
    for (const device_id of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      const r = await resolveChannel(reader, { app_id: APP, device_id });
      expect(r.channelId, device_id).toBeNull();
      expect(await checkUpdate(reader, { app_id: APP, device_id } as never)).toMatchObject({ message: expect.any(String) });
    }
  });
});

describe("S-2 open redirect through next=", () => {
  it("refuses control characters and whitespace that browsers strip into //host", () => {
    for (const bad of ["/\t/evil.example", "/\n/evil.example", "/\r\n/evil.example", "/ /evil.example", "/ /evil.example", "/ /evil.example", "//evil.example", "/\\evil.example", "https://evil.example", "/\u0000/x"]) {
      expect(safeNext(bad), JSON.stringify(bad)).toBe("/app");
      expect(afterSignIn({ next: bad }), JSON.stringify(bad)).toBe("/app");
    }
  });
  it("keeps real in-app paths", () => {
    for (const ok of ["/app", "/app/billing?plan=solo&interval=year", "/accept-invite/abc", "/%2F/evil.example", "/onboarding?next=%2Fapp"]) expect(safeNext(ok)).toBe(ok);
  });
});

describe("S-3 per-address limit on sign-in and invite mail", () => {
  it("allows 5 per address per 10 minutes, then refuses, case-insensitively and per endpoint", async () => {
    const db = createMemoryDb("hotrail");
    const out: (string | null)[] = [];
    for (let i = 0; i < 7; i++) out.push(await emailLimitFor("/sign-in/magic-link", { email: i % 2 ? "Victim@Example.com " : "victim@example.com" }, db));
    expect(out.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(out[5]).toMatch(/Too many sign-in links/);
    expect(await emailLimitFor("/sign-in/magic-link", { email: "other@example.com" }, db)).toBeNull();
    expect(await emailLimitFor("/organization/invite-member", { email: "victim@example.com" }, db)).toBeNull();
    expect(await emailLimitFor("/get-session", { email: "victim@example.com" }, db)).toBeNull();
    expect(await emailLimitFor("/sign-in/magic-link", { email: { $ne: 1 } }, db)).toBeNull();
  });
});

describe("S-4 session replay after sign-out", () => {
  it("the Better Auth cookie cache is off, so every session read checks the session store", async () => {
    const { createAuth } = await import("@/lib/auth");
    const { memoryAdapter } = await import("better-auth/adapters/memory");
    const auth = createAuth(memoryAdapter({ user: [], session: [], account: [], verification: [] }) as never);
    expect(auth.options.session?.cookieCache?.enabled).toBe(false);
  });
});

describe("S-5 personal export respects org roles", () => {
  const data = { billingAccount: { id: "o" }, entitlement: { plan: "team" }, webhookEndpoints: [{ id: "w" }], auditLog: [{ ip: "1.2.3.4" }], apps: [] };
  it("viewer gets app data only", () => {
    const v = orgExportFor("viewer", data);
    expect(v).not.toHaveProperty("auditLog");
    expect(v).not.toHaveProperty("billingAccount");
    expect(v).not.toHaveProperty("entitlement");
    expect(v).not.toHaveProperty("webhookEndpoints");
    expect(v).toHaveProperty("apps");
  });
  it("member gets billing and webhooks but not the audit log; owner gets everything; unknown role gets nothing extra", () => {
    expect(orgExportFor("member", data)).not.toHaveProperty("auditLog");
    expect(orgExportFor("member", data)).toHaveProperty("billingAccount");
    expect(Object.keys(orgExportFor("owner", data)).sort()).toEqual(Object.keys(data).sort());
    expect(orgExportFor(null, data)).not.toHaveProperty("auditLog");
  });
});

describe("S-7 mail: no codes in logs, one-line subjects", () => {
  it("the console transport logs no subject (2FA codes live there)", async () => {
    const spy = vi.spyOn(log, "info");
    await consoleTransport().send({ to: "a@b.test", from: "x@y.test", subject: "123456 is your Hotrail code", text: "t", html: "h" });
    expect(JSON.stringify(spy.mock.calls)).not.toContain("123456");
    spy.mockRestore();
  });
  it("subjects lose CR/LF and control characters and are bounded", () => {
    expect(safeSubject("Acme\r\nBcc: victim@x.test invited you")).toBe("Acme Bcc: victim@x.test invited you");
    expect(safeSubject("a".repeat(500))).toHaveLength(200);
  });
});
