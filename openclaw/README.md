# SnapRender — OpenClaw Skill

Give [OpenClaw](https://github.com/nicepkg/openclaw) the ability to capture website screenshots using SnapRender.

[![ClawHub](https://img.shields.io/badge/ClawHub-snaprender-blue)](https://clawhub.ai/skills/snaprender)

## Quick Install (ClawHub)

```bash
clawhub install snaprender
```

## Manual Setup

### 1. Copy the skill file

```bash
mkdir -p ~/.openclaw/skills/snaprender
cp SKILL.md ~/.openclaw/skills/snaprender/SKILL.md
```

### 2. Enable in config

Add to `~/.openclaw/openclaw.json`:

```json
{
  "skills": {
    "entries": {
      "snaprender": {
        "enabled": true,
        "env": { "SNAPRENDER_API_KEY": "sk_live_your_key_here" }
      }
    }
  }
}
```

### 3. Test

```bash
openclaw agent --local --session-id test --message "Screenshot stripe.com for me"
```

## Prerequisites

- **curl** — pre-installed on macOS/Linux
- **jq** — `brew install jq` (macOS), `apt install jq` (Ubuntu)

## How It Works

The agent reads the skill description and runs `curl` via the exec tool to call the SnapRender API. The response is piped through `jq` to extract the base64 image, which is decoded and saved to `/tmp/screenshot.jpg`. The agent then reports capture metadata (file size, response time, cache status, remaining credits).

## Alternative: Hosted MCP Endpoint

If your client supports MCP (Claude Desktop, Claude Code, Cursor, etc.), you can skip the skill entirely and connect to the hosted endpoint. No install, no curl, no jq — just a URL and your API key.

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "snaprender": {
      "type": "streamable-http",
      "url": "https://app.snap-render.com/mcp",
      "headers": {
        "Authorization": "Bearer sk_live_your_key_here"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add snaprender --transport streamable-http https://app.snap-render.com/mcp -H "Authorization: Bearer sk_live_your_key_here"
```

### Cursor / Any MCP Client

Point your client at `https://app.snap-render.com/mcp` with an `Authorization: Bearer sk_live_...` header. Uses [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http).

## Get an API Key

Sign up free at [app.snap-render.com](https://app.snap-render.com/auth/signup) — 50 screenshots/month, no credit card required.

## Related

- [MCP Server](../mcp-server/) — Full MCP docs, local install, tool reference
- [Node.js SDK](https://www.npmjs.com/package/snaprender) — `npm install snaprender`
- [Python SDK](https://pypi.org/project/snaprender/) — `pip install snaprender`
- [ChatGPT Actions](../chatgpt-actions/) — OpenAPI spec for Custom GPTs
