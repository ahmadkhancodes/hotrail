import { after } from "next/server";
import { NO_UPDATE } from "@buffersol/hotrail-core";
import { checkUpdate } from "@/lib/hotpath/check";
import { storePointerReader } from "@/lib/ship/device";
import { shipDeps } from "@/lib/ship/context";
import { recordActiveDevice } from "@/lib/ship/metering";
import { getStore } from "@/lib/storage";

// Hot path. Node runtime today; the logic in lib/hotpath only needs fetch + WebCrypto, so `runtime = "edge"` is a
// one-line switch once the store is the R2 public host. It never touches the database or auth: pointers only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Per instance memo so a busy device does not cost a database round trip on every check. */
const seen = new Set<string>();
function seenThisMonth(b: { app_id?: unknown; device_id?: unknown }): boolean {
  if (typeof b?.app_id !== "string" || typeof b?.device_id !== "string") return true;
  const k = `${new Date().toISOString().slice(0, 7)}|${b.app_id}|${b.device_id}`;
  if (seen.has(k)) return true;
  if (seen.size > 50_000) seen.clear();
  seen.add(k);
  return false;
}

const headers = { "content-type": "application/json", "cache-control": "no-store" };

/** @capgo/capacitor-updater `updateUrl`. Any error is "no update" with HTTP 200. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Parameters<typeof checkUpdate>[1];
    // MAU counting runs after the response is sent; the answer itself never waits for the database.
    after(async () => {
      if (!seenThisMonth(body)) await recordActiveDevice(await shipDeps(), body.app_id, body.device_id).catch(() => undefined);
    });
    return new Response(JSON.stringify(await checkUpdate(storePointerReader(await getStore()), body)), { status: 200, headers });
  } catch {
    return new Response(JSON.stringify(NO_UPDATE), { status: 200, headers });
  }
}
