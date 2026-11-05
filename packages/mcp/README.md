# @buffersol/hotrail-mcp

MCP server for [Hotrail](https://hotrail.buffersoltech.com) live updates. It lets an AI agent upload a web build, release it, roll it back and read stats, over stdio. It makes no LLM calls.

## Install

Run it with `npx`, nothing to install globally.

Claude Code:

```bash
claude mcp add hotrail --env HOTRAIL_API_KEY=hr_xxx -- npx -y @buffersol/hotrail-mcp
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "hotrail": {
      "command": "npx",
      "args": ["-y", "@buffersol/hotrail-mcp"],
      "env": { "HOTRAIL_API_KEY": "hr_xxx" }
    }
  }
}
```

## Configuration

| Env var | Meaning |
| --- | --- |
| `HOTRAIL_API_KEY` | Required. Hotrail API key. Its scope (read, upload, all) limits which tools work. Never logged. |
| `HOTRAIL_API_URL` | Optional. Defaults to `https://hotrail.buffersoltech.com`. |

## Tools

- `upload` (`appId`, `version`, one of `dir` or `zipPath`): uploads a new immutable bundle and returns its headcode. Does not release it. Needs an upload scope key.
- `release` (`appId`, `channel`, `bundle` or `version`, `percent`, `confirm`): releases a bundle to a channel.
- `rollback` (`appId`, `channel`, `confirm`): returns a channel to its previous bundle at 100%.
- `stats` (`appId`): read only. Channels, bundles, device totals and 24 hour failure rates.

## The confirm rule

`release` and `rollback` change what real devices receive. They only act when called with `confirm: true`. Without it they return a dry run that states the channel, the bundle, the percent and what the channel serves now, and they call no mutating endpoint. Ask the user before passing `confirm: true`.

API errors, including scope errors, come back as tool errors (`isError`).

MIT licensed.
