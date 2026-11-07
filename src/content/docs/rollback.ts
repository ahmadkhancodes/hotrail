import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const rollback: DocPage = {
  slug: "rollback",
  title: "Rollback",
  description: `Reverse a channel to its previous bundle in ${p.name}, and how devices recover on their own.`,
  sections: [
    {
      heading: "Roll back a channel",
      body: [
        "Rollback points the channel at the bundle it served before, at 100 percent. Run it from the CLI or the console. Devices pick it up on their next update check.",
      ],
      code: { lang: "bash", code: "npx @buffersol/hotrail rollback --channel production" },
    },
    {
      heading: "How fast it takes effect",
      body: [
        "The update check reads a small pointer file for the channel. A release or rollback writes a new pointer and the cache expires within about 5 seconds. Devices still need to check for updates, so the speed you see depends on how often your app calls sync.",
      ],
    },
    {
      heading: "Crash revert on the device",
      body: [
        "Separately from rollback, the plugin treats a new bundle as a trial. If your app does not call notifyAppReady in time, or crashes on start, the plugin reverts to the last good bundle and sends a rollback beacon. See the plugin page.",
      ],
    },
    {
      heading: "Kill switch",
      body: [
        "If an update response carries kill_switch set to true, the plugin reverts to the built-in bundle and downloads nothing.",
      ],
    },
  ],
};
