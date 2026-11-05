import { afterAll } from "vitest";
import { createMemoryDb } from "@/lib/db/memory";
import { dbContract } from "./dbContract";

dbContract("memory", async () => createMemoryDb("hotrail"));

// Same contract against a real Mongo (Atlas test DB) when provided.
const uri = process.env.MONGODB_URI_TEST;
if (uri) {
  const dbName = `hotrail_test_${Date.now()}`;
  dbContract("mongo", async () => (await import("@/lib/db/mongo")).createMongoDb(uri, dbName, "hotrail"));
  afterAll(async () => {
    const c = await (await import("@/lib/db/mongo")).mongoClient(uri);
    await c.db(dbName).dropDatabase();
    await c.close();
  });
}
