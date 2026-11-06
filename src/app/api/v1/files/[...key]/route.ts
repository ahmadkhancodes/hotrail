import { getStore } from "@/lib/storage";
import { PUBLIC_PREFIXES } from "@/lib/ship/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public download of bundle zips and manifests when the store has no CDN host (memory, fs, R2 without a custom domain). */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const key = (await ctx.params).key.join("/");
  if (!PUBLIC_PREFIXES.some((p) => key.startsWith(p))) return new Response("Not found", { status: 404 });
  let data: Uint8Array | null = null;
  try { data = await (await getStore()).get(key); } catch { data = null; }
  if (!data) return new Response("Not found", { status: 404 });
  const zip = key.endsWith(".zip");
  return new Response(data as BodyInit, {
    headers: {
      "content-type": zip ? "application/zip" : key.startsWith("blobs/") ? "application/octet-stream" : "application/json",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
