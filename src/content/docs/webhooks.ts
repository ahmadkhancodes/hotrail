import { product as p, cadence } from "@/config/product";
import type { DocPage } from "./types";

export const webhooks: DocPage = {
  slug: "webhooks",
  title: "Webhooks",
  description: `Receive signed events from ${p.name} at your own endpoint and verify them.`,
  sections: [
    {
      heading: "Overview",
      body: [
        "Add an endpoint URL in Settings, then Webhooks. We send an HTTP POST with a JSON body each time a subscribed event happens. Each endpoint has its own signing secret, shown once when you create it.",
      ],
    },
    {
      heading: "Events",
      body: [
        "Subscribe to any of these: release.created, release.rolled_back, channel.paused, bundle.uploaded, billing.updated and channel.failure_spike.",
        "A manual pause or an auto-pause is delivered as channel.paused, with a cause of manual or autopause followed by the reason. channel.failure_spike is an early warning: it is delivered when the failure rate of a live bundle reaches half the channel's auto-pause threshold (with at least the minimum sample), at most once every 30 minutes per channel. It carries rate, sample and threshold, so you can alert before the pause happens.",
      ],
    },
    {
      heading: "Headers",
      body: [
        "Every delivery carries three headers. x-webhook-id is a unique ID for the event, so you can deduplicate. x-webhook-event is the event name. x-webhook-signature proves the request came from us.",
        "The signature has the form t=<unix>,v1=<hex>, where t is the Unix time we signed and v1 is the hex encoded HMAC SHA256 of the string t, a dot, then the raw request body, using the endpoint secret as the key.",
      ],
    },
    {
      heading: "Verify a signature in Node",
      body: [
        "Use the raw body, not a re-serialized one. Compare in constant time and reject old timestamps to stop replays.",
      ],
      code: {
        lang: "js",
        code: `import crypto from "node:crypto";

export function verify(rawBody, header, secret, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(t + "." + rawBody)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1 ?? "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}`,
      },
    },
    {
      heading: "Responding",
      body: [
        "Return any 2xx status within 10 seconds to acknowledge. Do slow work after you respond. Any other status, or a timeout, counts as a failure.",
      ],
    },
    {
      heading: "Retries",
      body: [
        cadence.retries,
      ],
    },
  ],
};
