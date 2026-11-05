import { withApi } from "@/lib/http";
import { authenticateRequest, routerOptions, shipDeps } from "@/lib/ship/context";
import { handleShip } from "@/lib/ship/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ path: string[] }> };

// Control API: API key (CLI, CI) or console session. The CSRF origin check runs inside authenticateRequest for cookie
// requests only; key requests and the signed blob PUT (the URL signature is the credential) carry no Origin header.
const handler = withApi<Ctx>(async (req, ctx) => {
  const { path } = await ctx.params;
  const deps = await shipDeps();
  return handleShip(req, path, deps, authenticateRequest, routerOptions(deps.db));
}, { csrf: false });

export const GET = handler;
export const POST = handler;
export const PUT = handler;
