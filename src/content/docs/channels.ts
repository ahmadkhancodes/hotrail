import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const channels: DocPage = {
  slug: "channels",
  title: "Channels",
  description: `A channel is a named line that points at one bundle. Learn how ${p.name} channels, bundles and compatibility work.`,
  sections: [
    {
      heading: "Bundles and channels",
      body: [
        "A bundle is one immutable upload of your web build. Each bundle has a version and a four character headcode such as 2K47. A channel points at one bundle at a time and remembers the previous one.",
        "New apps start with a production channel. Create more, such as staging or beta, in the console.",
      ],
    },
    {
      heading: "Upload does not release",
      body: [
        "Uploading only stores the bundle. No device receives it until you release it to a channel. This lets you upload from CI and release by hand.",
      ],
      code: {
        lang: "bash",
        code: `npx @buffersol/hotrail upload
npx @buffersol/hotrail release --channel staging --bundle 2K47`,
      },
    },
    {
      heading: "Native compatibility",
      body: [
        "Each upload records a native fingerprint of your project. Run native register after every store release so Hotrail knows which store builds exist. A bundle is only offered to store builds it is compatible with. The release command lists any store builds that were skipped and why.",
      ],
      code: { lang: "bash", code: "npx @buffersol/hotrail native register --build 41 --platform ios" },
    },
    {
      heading: "Checking state",
      body: [
        "The status command lists each channel with its bundle, rollout percent and whether it is live, rolling out, paused or idle.",
      ],
      code: { lang: "bash", code: "npx @buffersol/hotrail status" },
    },
  ],
};
