import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const api: DocPage = {
  slug: "api",
  title: "API reference",
  description: `The ${p.name} REST API: authentication, endpoints, errors and rate limits.`,
  sections: [
    {
      heading: "Base URL and authentication",
      body: [
        `All requests go to ${p.url}/api/v1 over HTTPS and need an x-api-key header. Bodies and responses are JSON.`,
      ],
    },
    {
      heading: "GET /api/v1/me",
      body: ["Returns the organization the API key belongs to. Use it to check that a key works."],
      code: {
        lang: "json",
        code: `{\n  "orgId": "org_123"\n}`,
      },
    },
    {
      heading: "Key scopes",
      body: [
        "Each key has a scope, chosen when you create it. All can upload, release and roll back. Upload only can upload bundles and nothing else, which is what a CI job needs. Read only can list apps, bundles and channels. A key used outside its scope gets 403 with the code insufficient_scope.",
      ],
    },
    {
      heading: "Upload and release endpoints",
      body: [
        "POST /api/v1/bundles?appId=com.example.app&version=1.2.3 takes a zip as the request body, checks it against the native file and archive size policy, signs the manifest with the app's key and returns the new bundle and its headcode. Only files the app has not stored before are written. The CLI uses POST /api/v1/upload/plan, a direct PUT for each missing file, then POST /api/v1/upload/finalize, so an unchanged build sends almost nothing.",
        "POST /api/v1/channels/release with appId, channel, bundle (a headcode) or version, and percent points a channel at a bundle. POST /api/v1/channels/rollback, /pause and /resume take appId and channel. GET /api/v1/channels?appId= lists channels, GET /api/v1/bundles?appId= lists bundles, and GET /api/v1/line?appId= returns everything the console shows.",
      ],
      code: {
        lang: "json",
        code: `{
  "headcode": "1A01",
  "version": "2.14.1",
  "percent": 25,
  "channel": "production",
  "action": "release"
}`,
      },
    },
    {
      heading: "Device endpoints for the updater plugin",
      body: [
        "Point @capgo/capacitor-updater at POST /api/v1/updates/check (updateUrl), POST /api/v1/updates/stats (statsUrl) and /api/v1/updates/channel (channelUrl). These need no API key. The check endpoint always answers HTTP 200: an update object with version, url and checksum, or a message saying no new version is available.",
      ],
    },
    {
      heading: "Errors",
      body: [
        "Errors use a matching HTTP status and a JSON body with a stable snake case code. Match on the code, not on the status text.",
      ],
      code: {
        lang: "json",
        code: `{\n  "error": "invalid_api_key"\n}`,
      },
    },
    {
      heading: "Rate limits",
      body: [
        "Each API key can make 600 requests per minute. Beyond that you get a 429 status with the error code rate_limited. Wait for the next minute and retry with exponential backoff.",
      ],
    },
    {
      heading: "Account export and deletion",
      body: [
        "GET /api/account/export returns a JSON copy of your account data. DELETE /api/account permanently deletes your account and organization. Both require a signed in session and are also available in Settings, then Account.",
      ],
    },
  ],
};
