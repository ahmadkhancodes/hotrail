import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { autoEnsureIndexes } from "@/lib/db/mongo";
import { getDb } from "@/lib/db";

beforeEach(() => {
  globalThis.__kitIndexes = undefined;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("autoEnsureIndexes", () => {
  it("runs once and does not re-run on a second call", async () => {
    const run = vi.fn(async () => {});
    await autoEnsureIndexes("k", run);
    await autoEnsureIndexes("k", run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("an index error does not throw and is logged scrubbed", async () => {
    const run = vi.fn(async () => {
      throw new Error("bad auth mongodb+srv://user:secret@host/db");
    });
    await expect(autoEnsureIndexes("e", run)).resolves.toBeUndefined();
    const msg = String((console.warn as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]);
    expect(msg).not.toContain("secret");
  });

  it("is skipped during next build", () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    const run = vi.fn(async () => {});
    expect(autoEnsureIndexes("b", run)).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });

  it("is skipped for the memory driver (getDb never touches it)", async () => {
    vi.stubEnv("MONGODB_URI", "");
    const db = await getDb();
    expect(db).toBeTruthy();
    expect(globalThis.__kitIndexes?.size ?? 0).toBe(0);
  });
});
