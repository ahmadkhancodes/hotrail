import { NO_UPDATE } from "@buffersol/hotrail-core";
import { checkUpdate } from "@/lib/hotpath/check";
import { storePointerReader } from "@/lib/ship/device";
import { getStore } from "@/lib/storage";

// Hot path. Node runtime today; the logic in lib/hotpath only needs fetch + WebCrypto, so `runtime = "edge"` is a
// one-line switch once the store is the R2 public host. It never touches the database or auth: pointers only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "content-type": "application/json", "cache-control": "no-store" };

/** @capgo/capacitor-updater `updateUrl`. Any error is "no update" with HTTP 200. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Parameters<typeof checkUpdate>[1];
    return new Response(JSON.stringify(await checkUpdate(storePointerReader(await getStore()), body)), { status: 200, headers });
  } catch {
    return new Response(JSON.stringify(NO_UPDATE), { status: 200, headers });
  }
}
