import { describe, expect, it, vi } from "vitest";
vi.mock("@/app/fonts", () => ({ sans: { variable: "" }, mono: { variable: "" }, display: { variable: "" } }));
vi.mock("@vercel/analytics/next", () => ({ Analytics: () => null }));
import { GET } from "@/app/favicon.ico/route";
import { metadata as rootMeta } from "@/app/layout";
import { metadata as homeMeta } from "@/app/(marketing)/page";
import { metadata as pricingMeta } from "@/app/(marketing)/pricing/page";
import { pageMetadata } from "@/lib/seo";
import { product } from "@/config/product";

const og = new URL("/opengraph-image", product.url).toString();
const urlsOf = (v: unknown) => (Array.isArray(v) ? v : [v]).map((i) => (typeof i === "string" ? i : (i as { url: string }).url));

describe("favicon and share image", () => {
  it("/favicon.ico redirects to /icon", () => {
    const res = GET(new Request("https://example.test/favicon.ico"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://example.test/icon");
  });

  it.each([
    ["root", rootMeta],
    ["home", homeMeta],
    ["pricing", pricingMeta],
    ["pageMetadata", pageMetadata({ title: "T", description: "D", path: "/docs" })],
  ])("%s metadata emits og:image and twitter:image", (_n, m) => {
    expect(urlsOf(m.openGraph?.images)).toContain(og);
    expect(urlsOf(m.twitter?.images)).toContain(og);
  });
});
