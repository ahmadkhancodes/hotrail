import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const gettingStarted: DocPage = {
  slug: "getting-started",
  title: "Account and API keys",
  description: `Create a ${p.name} account, an organization and an API key for the CLI and CI.`,
  sections: [
    {
      heading: "Create your account",
      body: [
        `Go to ${p.url} and sign in with your email. We send a magic link, so there is no password to set. Your first sign in creates an organization that holds your apps, members and billing.`,
        `New accounts start on the ${p.plans[0]?.name ?? "Free"} plan. You can upgrade from Settings, then Billing, at any time.`,
      ],
    },
    {
      heading: "Create an API key",
      body: [
        "Open Settings, then API keys, and create a key. The full key is shown once, so copy it into your secrets manager straight away. Keys are stored as hashes and cannot be recovered. Use the key in the CLI and in CI as HOTRAIL_API_KEY.",
      ],
    },
    {
      heading: "Check the key",
      body: ["Send the key in the x-api-key header. This call returns the organization the key belongs to."],
      code: {
        lang: "bash",
        code: `curl ${p.url}/api/v1/me \\\n  -H "x-api-key: YOUR_API_KEY"`,
      },
    },
    {
      heading: "Next steps",
      body: [
        "Follow the quickstart to ship a first bundle or migrate from @capgo/capacitor-updater. Read the authentication guide to add passkeys and two factor sign in. Set up webhooks to receive events in your own systems.",
      ],
    },
  ],
};
