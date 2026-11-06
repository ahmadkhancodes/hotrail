import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const mcp: DocPage = {
  slug: "mcp",
  title: "MCP server",
  description: `Let an AI agent upload, release, roll back and read stats with the @buffersol/hotrail-mcp server.`,
  sections: [
    {
      heading: "What it is",
      body: [
        `@buffersol/hotrail-mcp is a Model Context Protocol server for ${p.name}. It runs locally over stdio and makes no LLM calls. It is stdio only. A hosted HTTP endpoint does not exist yet.`,
      ],
    },
    {
      heading: "Install",
      body: ["Add it to Claude Code with one command, or add the same command and env to any MCP client config."],
      code: {
        lang: "bash",
        code: "claude mcp add hotrail --env HOTRAIL_API_KEY=hr_xxx -- npx -y @buffersol/hotrail-mcp",
      },
    },
    {
      heading: "Configuration",
      body: [
        "HOTRAIL_API_KEY is required. Its scope (read, upload or all) decides which tools work, and it is never logged. HOTRAIL_API_URL is optional and defaults to the production host.",
      ],
    },
    {
      heading: "Tools",
      body: [
        "upload takes appId, version and one of dir or zipPath. It stores a bundle and returns its headcode, without releasing it. release takes appId, channel, bundle or version, percent and confirm. rollback takes appId, channel and confirm. stats takes appId and is read only: channels, bundles, device totals and 24 hour failure rates.",
      ],
    },
    {
      heading: "The confirm rule",
      body: [
        "release and rollback change what real devices receive, so they act only with confirm set to true. Without it they return a dry run that names the channel, bundle, percent and what the channel serves now, and call no mutating endpoint. Ask the user before passing confirm. API errors come back as tool errors.",
      ],
    },
  ],
};
