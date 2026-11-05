import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../../packages/mcp/src/server";
import { writeZip } from "../../packages/mcp/src/zip";
import { BASE, harness } from "./helpers/ship";

const APP = "com.example.mcp";
const enc = new TextEncoder();

async function connect(key = "all") {
  const h = harness();
  const server = createServer({ apiKey: `hr_${key}`, apiUrl: BASE, fetchImpl: h.fetch });
  const client = new Client({ name: "test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const run = async (name: string, args: Record<string, unknown>) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { type: string; text: string }[] };
    return { isError: !!r.isError, text: r.content.map((c) => c.text).join("\n") };
  };
  return { h, run, client };
}

function zipFile(marker: string): string {
  const dir = mkdtempSync(join(tmpdir(), "hr-mcp-"));
  const p = join(dir, "b.zip");
  writeFileSync(p, writeZip([{ path: "index.html", data: enc.encode(`<html>${marker}</html>`) }, { path: "app.js", data: enc.encode(`console.log("${marker}")`) }]));
  return p;
}

const channelOf = async (h: ReturnType<typeof harness>, name = "production") => {
  const app = (await h.deps.db.getAppByBundleId(APP))!;
  return (await h.deps.db.getChannelByName(app.id, name))!;
};

describe("MCP server against the in-process API", () => {
  it("lists the four tools", async () => {
    const { client } = await connect();
    expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual(["release", "rollback", "stats", "upload"]);
  });

  it("uploads from zipPath and from dir", async () => {
    const { run } = await connect();
    const r = await run("upload", { appId: APP, version: "1.0.0", zipPath: zipFile("one") });
    expect(r.isError).toBe(false);
    expect(r.text).toMatch(/Uploaded 1\.0\.0 as [0-9A-Z]{4}/);
    const dir = mkdtempSync(join(tmpdir(), "hr-mcp-dir-"));
    writeFileSync(join(dir, "index.html"), "<html>two</html>");
    const r2 = await run("upload", { appId: APP, version: "1.0.1", dir });
    expect(r2.isError).toBe(false);
    expect((await run("upload", { appId: APP, version: "1.0.2" })).isError).toBe(true);
  });

  it("release is a dry run without confirm, and moves the channel with it", async () => {
    const { h, run } = await connect();
    const up = await run("upload", { appId: APP, version: "1.0.0", zipPath: zipFile("one") });
    const code = up.text.match(/as (\S+) /)![1]!;
    const before = await channelOf(h);
    const calls = h.wire.calls.length;

    const dry = await run("release", { appId: APP, channel: "production", bundle: code, percent: 50 });
    expect(dry.isError).toBe(false);
    expect(dry.text).toContain("DRY RUN");
    expect(dry.text).toContain("confirm: true");
    expect(dry.text).toContain(code);
    expect(dry.text).toContain("50%");
    expect(await channelOf(h)).toEqual(before);
    expect(h.wire.calls.slice(calls).some((c) => c.startsWith("POST"))).toBe(false);
    const explicitFalse = await run("release", { appId: APP, channel: "production", bundle: code, confirm: false });
    expect(explicitFalse.text).toContain("DRY RUN");
    expect((await channelOf(h)).currentBundleId).toBeNull();

    const done = await run("release", { appId: APP, channel: "production", bundle: code, percent: 50, confirm: true });
    expect(done.isError).toBe(false);
    expect(done.text).toContain(`Released ${code}`);
    const after = await channelOf(h);
    expect(after.currentBundleId).not.toBeNull();
    expect(after.rolloutPercent).toBe(50);
  });

  it("rollback is a dry run without confirm and reverts with it", async () => {
    const { h, run } = await connect();
    const codes: string[] = [];
    for (const v of ["1.0.0", "1.0.1"]) {
      const up = await run("upload", { appId: APP, version: v, zipPath: zipFile(v) });
      codes.push(up.text.match(/as (\S+) /)![1]!);
      expect((await run("release", { appId: APP, channel: "production", bundle: codes.at(-1), confirm: true })).isError).toBe(false);
    }
    const before = await channelOf(h);
    const dry = await run("rollback", { appId: APP, channel: "production" });
    expect(dry.isError).toBe(false);
    expect(dry.text).toContain("DRY RUN");
    expect(dry.text).toContain(codes[1]!);
    expect(dry.text).toContain(codes[0]!);
    expect(await channelOf(h)).toEqual(before);

    const done = await run("rollback", { appId: APP, channel: "production", confirm: true });
    expect(done.isError).toBe(false);
    expect(done.text).toContain(codes[0]!);
    expect((await channelOf(h)).currentBundleId).toBe(before.previousBundleId);
  });

  it("stats summarises the line", async () => {
    const { run } = await connect();
    const up = await run("upload", { appId: APP, version: "1.0.0", zipPath: zipFile("one") });
    const code = up.text.match(/as (\S+) /)![1]!;
    await run("release", { appId: APP, channel: "production", bundle: code, confirm: true });
    const s = await run("stats", { appId: APP });
    expect(s.isError).toBe(false);
    expect(s.text).toContain("1 bundles");
    expect(s.text).toContain("production");
    expect(s.text).toContain("failure 0.0%");
  });

  it("surfaces scope and auth errors as tool errors", async () => {
    const owner = await connect();
    const up = await owner.run("upload", { appId: APP, version: "1.0.0", zipPath: zipFile("one") });
    const code = up.text.match(/as (\S+) /)![1]!;
    // read key cannot upload; upload key cannot read stats; confirmed release by a read key is rejected
    const read = createServer({ apiKey: "hr_read", apiUrl: BASE, fetchImpl: owner.h.fetch });
    const c = new Client({ name: "t", version: "0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([read.connect(a), c.connect(b)]);
    const call = async (name: string, args: Record<string, unknown>) => (await c.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    const u = await call("upload", { appId: APP, version: "9.9.9", zipPath: zipFile("x") });
    expect(u.isError).toBe(true);
    const r = await call("release", { appId: APP, channel: "production", bundle: code, confirm: true });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).not.toContain("hr_read");
    const bad = await connect("nobody");
    const s = await bad.run("stats", { appId: APP });
    expect(s.isError).toBe(true);
    expect(s.text).toContain("invalid_api_key");
    const other = await connect("other");
    expect((await other.run("stats", { appId: APP })).isError).toBe(true);
  });
});
