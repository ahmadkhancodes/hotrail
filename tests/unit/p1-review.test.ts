import { describe, expect, it } from "vitest";
import { MONGO_CLIENT_OPTIONS } from "@/lib/db/mongo";
import { createR2Store } from "@/lib/storage/r2";

// P1 fixes from docs/REVIEW.md.
describe("P1-19 mongo timeouts", () => {
  it("fails fast and has a socket timeout", () => {
    expect(MONGO_CLIENT_OPTIONS.serverSelectionTimeoutMS).toBeLessThanOrEqual(3000);
    expect(MONGO_CLIENT_OPTIONS.socketTimeoutMS).toBeGreaterThan(0);
  });
});

describe("P1-17 R2 read timeout", () => {
  it("aborts a hung GET instead of hanging the device request", async () => {
    const hung: typeof fetch = (_u, init) => new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))));
    const store = createR2Store({ accountId: "a", bucket: "b", credentials: { accessKeyId: "k", secretAccessKey: "s" }, fetchImpl: hung, readTimeoutMs: 50 });
    await expect(store.get("ptr/x/index.json")).rejects.toThrow("aborted");
  });
});
