import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const migratingFromCapgo: DocPage = {
  slug: "migrating-from-capgo",
  title: "Migrating from Capgo",
  description: `Move a Capacitor app from Capgo to ${p.name} by changing three URLs, then swap the plugin at your next store build.`,
  sections: [
    {
      heading: "How it works",
      body: [
        `${p.name} answers the documented self-hosted update protocol used by @capgo/capacitor-updater. Your installed apps keep their plugin and only talk to different URLs. You do not need a new store build to start.`,
      ],
    },
    {
      heading: "Step 1: set up the project",
      body: [
        "Run init in your project. It detects your appId and web directory, writes hotrail.json and creates a signing key. If it finds @capgo/capacitor-updater in package.json it prints a migration note.",
      ],
      code: { lang: "bash", code: "npx @buffersol/hotrail init" },
    },
    {
      heading: "Step 2: point the three URLs",
      body: [
        "In your Capacitor config for @capgo/capacitor-updater, set updateUrl, statsUrl and channelUrl to your Hotrail URLs. Nothing else in your app code changes.",
      ],
      code: {
        lang: "text",
        code: `updateUrl:  ${p.url}/api/v1/updates/check
statsUrl:   ${p.url}/api/v1/updates/stats
channelUrl: ${p.url}/api/v1/updates/channel`,
      },
    },
    {
      heading: "Step 3: upload and release",
      body: [
        "Upload a build, then release it to a channel. Both commands use the version in your package.json. Start with a small percentage if you want to watch the first rollout.",
      ],
      code: {
        lang: "bash",
        code: `npx @buffersol/hotrail upload
npx @buffersol/hotrail release --channel production --percent 10`,
      },
    },
    {
      heading: "Step 4: swap the plugin later",
      body: [
        "At your next store build, replace @capgo/capacitor-updater with @buffersol/hotrail-updater. That plugin adds signed delta downloads and automatic crash revert. Until then the Capgo plugin keeps working against Hotrail with checksum verification only.",
        "The Swift and Kotlin code of our plugin is written but has not been compiled or tested on devices yet, and its CI workflow has not run green yet. If that matters for your release, stay on the Capgo plugin and only change the URLs for now.",
      ],
    },
  ],
};
