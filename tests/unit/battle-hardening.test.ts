import { describe, expect, it } from "vitest";
import { buildManifest } from "@buffersol/hotrail-core";
import { securityHeaders } from "@/lib/security/headers";
import { handleShip } from "@/lib/ship/router";
import { planBundle } from "@/lib/ship/upload";
import { harness } from "./helpers/ship";

const enc = (s: string) => new TextEncoder().encode(s);

describe("blob PUT checks the signature before reading the body", () => {
  it("a forged PUT is rejected 403 without the body stream being touched", async () => {
    const h = harness();
    let read = false;
    const body = new ReadableStream({ pull(c) { read = true; c.enqueue(enc("x")); c.close(); } }, { highWaterMark: 0 });
    const sha = "a".repeat(64);
    const req = new Request(`http://t/api/v1/upload/blob/${sha}?app=x&size=1&exp=${Math.floor(Date.now() / 1000) + 60}&sig=bad`, {
      method: "PUT", body, duplex: "half",
    } as RequestInit);
    const res = await handleShip(req, ["upload", "blob", sha], h.deps, async () => { throw new Error("no auth expected"); }).catch((e) => e);
    expect(res.status ?? (res as { status?: number }).status).toBe(403);
    expect(read).toBe(false);
  });
});

describe("case-colliding bundle paths are rejected", () => {
  it("buildManifest refuses A.js + a.js", async () => {
    await expect(buildManifest({ appId: "a.b.c", version: "1.0.0", nativeFingerprint: "n", files: [{ path: "A.js", data: enc("1") }, { path: "a.js", data: enc("2") }] })).rejects.toThrow(/duplicate/);
  });
  it("the server refuses a plan with case-folded duplicates", async () => {
    const h = harness();
    const m = await buildManifest({ appId: "com.example.case", version: "1.0.0", nativeFingerprint: "n", files: [{ path: "index.html", data: enc("1") }, { path: "app.js", data: enc("2") }] });
    m.files.push({ ...m.files[1], path: "App.js" });
    await expect(planBundle(h.deps, h.principals.all!, { appId: "com.example.case", version: "1.0.0", manifest: m, signature: "x" } as never)).rejects.toMatchObject({ status: 422 });
  });
});

describe("CSP covers the origins the app uses", () => {
  const csp = securityHeaders().find((x) => x.key === "Content-Security-Policy")!.value;
  it("allows Stripe form posts and redirects, Vercel analytics, and nothing framable", () => {
    expect(csp).toMatch(/form-action 'self' https:\/\/checkout\.stripe\.com https:\/\/billing\.stripe\.com/);
    expect(csp).toMatch(/connect-src 'self' [^;]*vitals\.vercel-insights\.com/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toMatch(/script-src[^;]*\*/);
  });
});
