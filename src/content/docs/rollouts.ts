import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const rollouts: DocPage = {
  slug: "rollouts",
  title: "Staged rollouts and auto-pause",
  description: `Release a bundle to a share of devices and let ${p.name} pause the channel when failures spike.`,
  sections: [
    {
      heading: "Percent rollouts",
      body: [
        "Release with a percent between 0 and 100. Each device is assigned to a bucket from a hash of its device ID and the channel, so a device that got the update keeps getting it as you raise the percent.",
      ],
      code: {
        lang: "bash",
        code: `npx @buffersol/hotrail release --channel production --bundle 2K47 --percent 5
npx @buffersol/hotrail release --channel production --bundle 2K47 --percent 50
npx @buffersol/hotrail release --channel production --bundle 2K47 --percent 100`,
      },
    },
    {
      heading: "Auto-pause",
      body: [
        "Pass --autopause with a failure rate from 0 to 1. For example 0.02 means 2 percent. An evaluator runs every minute. When the failure rate of the channel passes the threshold and enough devices have reported, the channel is paused.",
        "Pricing lists auto-pause under Maker and above. The code does not gate it by plan yet, so it runs on every plan, Free included.",
      ],
      code: {
        lang: "bash",
        code: "npx @buffersol/hotrail release --channel production --bundle 2K47 --percent 10 --autopause 0.02",
      },
    },
    {
      heading: "What a pause does",
      body: [
        "A paused channel stops offering the bundle to new devices. Devices that already installed it keep it. To go back to the previous bundle, roll back. The pause also sends a channel.paused webhook, The channel.failure_spike webhook warns earlier, at half the threshold.",
      ],
    },
    {
      heading: "Failures that count",
      body: [
        "Devices report download, checksum, signature, manifest and unzip failures, and crash reverts, through the stats beacon. Failures are stored in full. Successes are sampled at 10 percent.",
      ],
    },
  ],
};
