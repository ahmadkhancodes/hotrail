import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CADENCE_MODE, cadence, cadenceCopy } from "@/config/product";
import { docs } from "@/content/docs";

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.(tsx?|txt)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}
const publicFiles = [...walk("src/app/(marketing)"), ...walk("src/content"), ...walk("src/components/marketing"), ...walk("src/app/llms.txt"), ...walk("src/app/llms-full.txt")];

describe("cadence claims match the scheduler", () => {
  it("vercel.json respects the Hobby limit of two daily crons", () => {
    const { crons } = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { schedule: string }[] };
    expect(crons.length).toBeLessThanOrEqual(2);
    for (const c of crons) expect(c.schedule.split(" ").slice(0, 2).every((x) => /^\d+$/.test(x)) && c.schedule.split(" ").slice(2).every((x) => x === "*")).toBe(true);
  });

  it("docs carry the copy of the current cadence mode", () => {
    const text = JSON.stringify(docs);
    expect(text).toContain(cadence.autopause);
    expect(text).toContain(cadence.retries);
    for (const [mode, c] of Object.entries(cadenceCopy)) {
      if (mode === CADENCE_MODE) continue;
      expect(text).not.toContain(c.autopause);
      expect(text).not.toContain(c.retries);
    }
  });

  it("no public copy promises per-minute background work while the mode is daily", () => {
    if (CADENCE_MODE !== "daily") return;
    const banned = [/every minute/i, /every hour/i, /\bhourly\b/i, /within minutes/i, /real-?time/i, /\bminutes? ago\b/i, /retries every/i, /\(stub/i, /demo data/i, /not configured in this/i];
    for (const f of publicFiles) {
      const src = readFileSync(f, "utf8").replace(cadenceCopy.minute.autopause, "").replace(cadenceCopy.minute.retries, "");
      for (const re of banned) expect(src, `${f} matches ${re}`).not.toMatch(re);
    }
  });
});
