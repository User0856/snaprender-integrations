# SnapRender — OpenClaw Skill

Give [OpenClaw](https://github.com/nicepkg/openclaw) the ability to capture website screenshots using SnapRender.

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

## Get an API Key

Sign up free at [app.snap-render.com](https://app.snap-render.com/auth/signup) — 50 screenshots/month, no credit card required.

## Related

- [MCP Server](https://www.npmjs.com/package/snaprender-mcp) — For Claude Desktop & Claude Code
- [Node.js SDK](https://www.npmjs.com/package/snaprender) — `npm install snaprender`
- [Python SDK](https://pypi.org/project/snaprender/) — `pip install snaprender`
- [ChatGPT Actions](../chatgpt-actions/) — OpenAPI spec for Custom GPTs
