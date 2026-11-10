export interface ApiOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

/** Same wording as the server (src/lib/ship/types.ts); the platform's own 413 carries no JSON body. */
export const TOO_LARGE_HINT = "Uploads through the API are limited to 4.5 MB per file (per request) for now. A bigger limit arrives with object storage (R2).";

export class ApiError extends Error {
  constructor(public status: number, message: string, public hint?: string) {
    super(message);
  }
}

export function createApi(o: ApiOptions) {
  const f = o.fetchImpl ?? fetch;
  const base = o.baseUrl.replace(/\/$/, "");
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await f(base + path, {
      method,
      headers: { authorization: `Bearer ${o.apiKey}`, "content-type": "application/json", "user-agent": "hotrail-cli/0.1" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown = undefined;
    try { json = text ? JSON.parse(text) : undefined; } catch { /* non JSON body */ }
    if (!res.ok) {
      const j = (json ?? {}) as { error?: string; hint?: string };
      if (res.status === 413) throw new ApiError(413, j.error ?? "request_too_large", j.hint ?? TOO_LARGE_HINT);
      throw new ApiError(res.status, j.error ?? `Request failed with status ${res.status}`, j.hint);
    }
    return json as T;
  }
  return {
    get: <T>(path: string) => call<T>("GET", path),
    post: <T>(path: string, body: unknown) => call<T>("POST", path, body),
    /** Direct to storage (presigned URL); no auth header. */
    async put(url: string, data: Uint8Array, headers: Record<string, string> = {}): Promise<void> {
      const res = await f(url, { method: "PUT", headers, body: data as BodyInit });
      if (res.status === 413) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; hint?: string };
        throw new ApiError(413, j.error ?? "request_too_large", j.hint ?? TOO_LARGE_HINT);
      }
      if (!res.ok) throw new ApiError(res.status, `Upload to storage failed with status ${res.status}`);
    },
  };
}
export type Api = ReturnType<typeof createApi>;
