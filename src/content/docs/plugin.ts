import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const plugin: DocPage = {
  slug: "plugin",
  title: "Plugin",
  description: `The MIT licensed @buffersol/hotrail-updater Capacitor plugin: configuration, strategies, crash revert and delta updates.`,
  sections: [
    {
      heading: "Status",
      body: [
        "The TypeScript logic is covered by unit tests. The Swift and Kotlin code is written but has not been compiled or tested on devices yet, and the CI workflow for it has not run green yet. Treat version 0.1.0 as a pre release and run a device test, crash revert in particular, before you ship it.",
      ],
    },
    {
      heading: "Install and configure",
      body: [
        "Call configure as early as possible on every launch. It handles crash revert and applies a pending update. Then call notifyAppReady once your UI is healthy, and sync to look for an update. check, sync and notifyAppReady never throw into your app. Any error means no update.",
      ],
      code: {
        lang: "ts",
        code: `// npm i @buffersol/hotrail-updater && npx cap sync
import { HotrailUpdater } from "@buffersol/hotrail-updater";

await HotrailUpdater.configure({
  appId: "com.acme.app",
  updateUrl: "${p.url}/api/updates",
  statsUrl: "${p.url}/api/stats",
  channelUrl: "${p.url}/api/channel",
  publicKey: "<Ed25519 public key, base64>",
  strategy: "background",
});
await HotrailUpdater.notifyAppReady();
await HotrailUpdater.sync();`,
      },
    },
    {
      heading: "Strategies",
      body: [
        "background downloads now and applies when the app goes to the background or at the next launch. immediate applies right after the download is verified. prompt emits updateAvailable and updateReady and applies nothing until you call apply.",
      ],
    },
    {
      heading: "Delta updates",
      body: [
        "The update check response may include optional manifest_url and files_url. When present, the plugin downloads only changed files, reuses unchanged files from the current bundle and verifies each hash. When absent, it falls back to the full zip and checks its checksum. Bundle files are served from the CDN host when one is configured.",
      ],
    },
    {
      heading: "Crash revert",
      body: [
        "A new bundle runs as a trial until notifyAppReady is called. The plugin reverts to the last good bundle if appReadyTimeoutMs (default 10000) passes without confirmation, if the app relaunches with the trial unconfirmed, or if the native crash guard sees a second process start with the trial unconfirmed. The native guard is part of the code that is not yet tested on devices.",
      ],
    },
  ],
};
