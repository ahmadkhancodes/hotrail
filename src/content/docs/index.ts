import { channels } from "./channels";
import { cli } from "./cli";
import { limits } from "./limits";
import { mcp } from "./mcp";
import { migratingFromCapgo } from "./migrating-from-capgo";
import { plugin } from "./plugin";
import { rollback } from "./rollback";
import { rollouts } from "./rollouts";
import { signing } from "./signing";
import { api } from "./api";
import { authentication } from "./authentication";
import { billing } from "./billing";
import { gettingStarted } from "./getting-started";
import { quickstart } from "./quickstart";
import type { DocPage } from "./types";
import { webhooks } from "./webhooks";

export type { DocPage, DocSection } from "./types";

export interface DocGroup {
  title: string;
  docs: DocPage[];
}

export const docs: DocPage[] = [
  quickstart, gettingStarted, authentication, migratingFromCapgo,
  channels, rollouts, rollback, signing,
  cli, plugin, mcp,
  limits, billing,
  api, webhooks,
];

export const docGroups: DocGroup[] = [
  { title: "Start here", docs: [quickstart, gettingStarted, authentication, migratingFromCapgo] },
  { title: "Concepts", docs: [channels, rollouts, rollback, signing] },
  { title: "Tools", docs: [cli, plugin, mcp] },
  { title: "Account", docs: [limits, billing] },
  { title: "Build", docs: [api, webhooks] },
];

export const getDoc = (slug: string): DocPage | undefined => docs.find((d) => d.slug === slug);

export const sectionId = (heading: string): string =>
  heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
