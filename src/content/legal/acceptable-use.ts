import { product as p } from "@/config/product";
import type { LegalDoc } from "./types";

export const acceptableUse: LegalDoc = {
  slug: "acceptable-use",
  title: "Acceptable use policy",
  description: `What you may and may not do with ${p.name}.`,
  sections: [
    {
      id: "purpose",
      title: "Purpose",
      body: [`This policy keeps ${p.name} safe and reliable for everyone. It is part of the terms of service.`],
    },
    {
      id: "prohibited",
      title: "You must not",
      body: [
        {
          list: [
            "Break the law or help others do so.",
            "Collect data from your users without a lawful basis or without telling them.",
            "Ship native code, or content meant to change the primary purpose of your app, through a live update, or use an update to get around store rules.",
            "Ship malware, or an update that tracks or harms your users.",
            "Infringe intellectual property or privacy rights.",
            "Probe, scan or attack the service, or bypass rate limits and quotas.",
            "Resell the service as your own without written permission.",
            "Publish content that is hateful, threatening or sexually exploits minors.",
          ],
        },
      ],
    },
    {
      id: "enforcement",
      title: "Enforcement",
      body: [
        "We may pause releases, suspend apps or close accounts that break this policy. Where we can, we warn you first and give you time to fix the problem. For serious abuse we act immediately.",
      ],
    },
    {
      id: "report",
      title: "Report abuse",
      body: [`Email ${p.supportEmail} with the app ID and what you saw.`],
    },
  ],
};
