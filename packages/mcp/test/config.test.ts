import { describe, expect, it } from "vitest";
import { configFromEnv, DEFAULT_API_URL } from "../src/config";

describe("configFromEnv", () => {
  it("requires the api key", () => {
    expect(() => configFromEnv({})).toThrow(/HOTRAIL_API_KEY/);
    expect(() => configFromEnv({ HOTRAIL_API_KEY: "  " })).toThrow(/HOTRAIL_API_KEY/);
  });
  it("defaults the url and trims trailing slashes", () => {
    expect(configFromEnv({ HOTRAIL_API_KEY: "k" })).toEqual({ apiKey: "k", apiUrl: DEFAULT_API_URL });
    expect(configFromEnv({ HOTRAIL_API_KEY: "k", HOTRAIL_API_URL: "http://x.test//" }).apiUrl).toBe("http://x.test");
  });
  it("rejects a bad url without echoing the key", () => {
    expect(() => configFromEnv({ HOTRAIL_API_KEY: "secret", HOTRAIL_API_URL: "nope" })).toThrow(/not a valid URL/);
    try { configFromEnv({ HOTRAIL_API_KEY: "secret", HOTRAIL_API_URL: "nope" }); } catch (e) { expect(String(e)).not.toContain("secret"); }
  });
});
