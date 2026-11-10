import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyManifest, type Manifest } from "@buffersol/hotrail-core";
import { main, parseArgs, type Io } from "../src/cli";

function project(files: Record<string, string | Uint8Array> = { "index.html": "<html></html>", "app.js": "console.log(1)" }) {
  const cwd = mkdtempSync(join(tmpdir(), "hotrail-"));
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ version: "2.14.1", dependencies: { "@capacitor/core": "^8.0.0", "@capacitor/camera": "^8.2.0" } }));
  writeFileSync(join(cwd, "capacitor.config.ts"), `const config = { appId: 'com.example.ordering', webDir: 'dist' };\nexport default config;`);
  mkdirSync(join(cwd, "dist"));
  for (const [p, c] of Object.entries(files)) writeFileSync(join(cwd, "dist", p), c);
  return cwd;
}

function harness(cwd: string, server?: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const out: string[] = [];
  const err: string[] = [];
  const calls: { url: string; method: string; body?: string }[] = [];
  const io: Io = {
    cwd, env: { HOTRAIL_API_KEY: "hr_test", HOTRAIL_API_URL: "https://api.test" },
    out: (s) => out.push(s), err: (s) => err.push(s),
    fetchImpl: (async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: typeof init.body === "string" ? init.body : undefined });
      return server ? server(url, init) : new Response("{}", { status: 200 });
    }) as typeof fetch,
  };
  return { io, out, err, calls };
}

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });

describe("args", () => {
  it("parses flags", () => {
    expect(parseArgs(["release", "--channel", "beta", "--percent", "25", "--unsigned"])).toEqual({ cmd: "release", flags: { channel: "beta", percent: "25", unsigned: true } });
  });
});

describe("init", () => {
  it("detects appId, writes config and a private key, gitignores it", async () => {
    const cwd = project();
    const h = harness(cwd);
    expect(await main(["init"], h.io)).toBe(0);
    expect(JSON.parse(readFileSync(join(cwd, "hotrail.json"), "utf8")).appId).toBe("com.example.ordering");
    expect(existsSync(join(cwd, ".hotrail", "signing-key.json"))).toBe(true);
    expect(readFileSync(join(cwd, ".gitignore"), "utf8")).toContain(".hotrail/");
    expect(h.out.join("\n")).toContain("Public key");
  });
  it("offers migration mode when @capgo/capacitor-updater is present", async () => {
    const cwd = project();
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ dependencies: { "@capgo/capacitor-updater": "^7.0.0" } }));
    const h = harness(cwd);
    await main(["init"], h.io);
    expect(h.out.join("\n")).toMatch(/Migration mode/);
  });
  it("fails clearly outside a Capacitor project", async () => {
    const h = harness(mkdtempSync(join(tmpdir(), "hotrail-")));
    expect(await main(["init"], h.io)).toBe(1);
  });
});

describe("upload", () => {
  it("signs the manifest, uploads only missing blobs, finalizes", async () => {
    const cwd = project();
    const h0 = harness(cwd);
    await main(["init"], h0.io);
    const pub = JSON.parse(readFileSync(join(cwd, ".hotrail", "signing-key.json"), "utf8")).publicKey as string;
    const puts: string[] = [];
    let planBody: { manifest: Manifest; signature: string; appId: string; version: string } | undefined;
    const h = harness(cwd, async (url, init) => {
      if (url.endsWith("/api/v1/upload/plan")) {
        planBody = JSON.parse(init.body as string);
        const hashes = planBody!.manifest.files.map((f) => f.sha256);
        return json({ missing: [hashes[0]], uploads: { [hashes[0]!]: { url: "https://r2.test/put/" + hashes[0] } } });
      }
      if (url.startsWith("https://r2.test/put/")) { puts.push(url); return new Response(null, { status: 200 }); }
      if (url.endsWith("/api/v1/upload/finalize")) return json({ bundleId: "b1", headcode: "1A00", version: "2.14.1" });
      return json({ error: "unexpected" }, 500);
    });
    expect(await main(["upload"], h.io)).toBe(0);
    expect(puts).toHaveLength(1);
    expect(await verifyManifest({ manifest: planBody!.manifest, signature: planBody!.signature, keyId: "" }, pub)).toBe(true);
    expect(h.out.join("\n")).toContain("1A00");
    const auth = h.calls.find((c) => c.url.endsWith("/plan"));
    expect(auth).toBeDefined();
  });
  it("shows the 4.5 MB upload limit and the R2 note on a 413 (JSON or platform body)", async () => {
    for (const bodyless of [false, true]) {
      const cwd = project();
      await main(["init"], harness(cwd).io);
      const h = harness(cwd, async (url, init) => {
        if (url.endsWith("/api/v1/upload/plan")) {
          const sha = (JSON.parse(init.body as string) as { manifest: Manifest }).manifest.files[0]!.sha256;
          return json({ missing: [sha], uploads: { [sha]: { url: "https://api.test/api/v1/upload/blob/" + sha } } });
        }
        return bodyless ? new Response("Request Entity Too Large", { status: 413 }) : json({ error: "request_too_large", hint: "Uploads through the API are limited to 4.5 MB per file (per request) for now. A bigger limit arrives with object storage (R2)." }, 413);
      });
      expect(await main(["upload"], h.io)).toBe(1);
      expect(h.err.join("\n")).toMatch(/413/);
      expect(h.err.join("\n")).toMatch(/4\.5 MB.*R2/);
    }
  });
  it("blocks native files before any network call", async () => {
    const cwd = project({ "index.html": "<html></html>", "libfoo.so": new Uint8Array([1, 2, 3]) });
    await main(["init"], harness(cwd).io);
    const h = harness(cwd);
    expect(await main(["upload"], h.io)).toBe(1);
    expect(h.calls).toHaveLength(0);
    expect(h.err.join("\n")).toMatch(/libfoo\.so/);
    expect(h.err.join("\n")).toMatch(/compliance/);
  });
  it("rejects invalid version and missing key", async () => {
    const cwd = project();
    await main(["init"], harness(cwd).io);
    const h = harness(cwd);
    expect(await main(["upload", "--version", "banana"], h.io)).toBe(1);
    h.io.env.HOTRAIL_API_KEY = undefined;
    expect(await main(["upload"], h.io)).toBe(1);
    expect(h.err.join("\n")).toMatch(/HOTRAIL_API_KEY/);
  });
  it("surfaces API errors with their hint", async () => {
    const cwd = project();
    await main(["init"], harness(cwd).io);
    const h = harness(cwd, () => json({ error: "Duplicate bundle version.", hint: "Bump the version." }, 409));
    expect(await main(["upload"], h.io)).toBe(1);
    expect(h.err.join("\n")).toContain("Duplicate bundle version.");
    expect(h.err.join("\n")).toContain("Bump the version.");
  });
});

describe("release, rollback, status", () => {
  it("release sends channel, bundle, percent and autopause", async () => {
    const cwd = project();
    await main(["init"], harness(cwd).io);
    const h = harness(cwd, () => json({ headcode: "2K47", percent: 25, channel: "production" }));
    expect(await main(["release", "--bundle", "2K47", "--percent", "25", "--autopause", "0.02"], h.io)).toBe(0);
    expect(JSON.parse(h.calls[0]!.body!)).toMatchObject({ channel: "production", bundle: "2K47", percent: 25, autopauseThreshold: 0.02 });
    expect(h.out[0]).toBe("Released 2K47 to production at 25%.");
  });
  it("validates percent and requires a target", async () => {
    const cwd = project();
    await main(["init"], harness(cwd).io);
    const h = harness(cwd);
    expect(await main(["release", "--bundle", "2K47", "--percent", "250"], h.io)).toBe(1);
    expect(await main(["release"], h.io)).toBe(1);
    expect(h.calls).toHaveLength(0);
  });
  it("rollback and status print railway wording", async () => {
    const cwd = project();
    await main(["init"], harness(cwd).io);
    const r = harness(cwd, () => json({ headcode: "2K46", channel: "production" }));
    expect(await main(["rollback"], r.io)).toBe(0);
    expect(r.out[0]).toContain("Reversed production to 2K46");
    const s = harness(cwd, () => json({ channels: [{ name: "production", headcode: "2K47", percent: 25, paused: false }] }));
    await main(["status"], s.io);
    expect(s.out[0]).toContain("▲ A rolling out");
    const empty = harness(cwd, () => json({ channels: [] }));
    await main(["status"], empty.io);
    expect(empty.out[0]).toContain("No trains on this line yet");
  });
  it("unknown command exits 2", async () => {
    expect(await main(["nope"], harness(project()).io)).toBe(2);
  });
});

describe("M5 review: secrets never leave the machine", () => {
  it("refuses to send the API key over plain http (hotrail.json is a repo file anyone can edit)", async () => {
    const { safeApiUrl } = await import("../src/cli");
    expect(safeApiUrl("https://hotrail.buffersoltech.com")).toBe("https://hotrail.buffersoltech.com");
    expect(safeApiUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(() => safeApiUrl("http://attacker.example")).toThrow(/Refusing to send your API key/);
  });
  it("walk skips symlinks, the signing key folder and env files", async () => {
    const { symlinkSync } = await import("node:fs");
    const { walk } = await import("../src/project");
    const cwd = project();
    const dist = join(cwd, "dist");
    mkdirSync(join(dist, ".hotrail")); writeFileSync(join(dist, ".hotrail", "signing-key.json"), "{\"privateKey\":\"x\"}");
    writeFileSync(join(dist, ".env.production"), "SECRET=1");
    writeFileSync(join(cwd, "outside.txt"), "secret");
    symlinkSync(join(cwd, "outside.txt"), join(dist, "link.txt"));
    mkdirSync(join(dist, ".well-known")); writeFileSync(join(dist, ".well-known", "assetlinks.json"), "[]");
    expect(walk(dist).map((e) => e.path)).toEqual([".well-known/assetlinks.json", "app.js", "index.html"]);
  });
});
