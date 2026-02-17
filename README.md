# SnapRender Integrations

[![npm MCP](https://img.shields.io/npm/v/snaprender-mcp?label=MCP%20Server)](https://www.npmjs.com/package/snaprender-mcp)
[![npm SDK](https://img.shields.io/npm/v/snaprender?label=Node.js%20SDK)](https://www.npmjs.com/package/snaprender)
[![PyPI SDK](https://img.shields.io/pypi/v/snaprender?label=Python%20SDK)](https://pypi.org/project/snaprender/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Official integrations for [SnapRender Screenshot API](https://snap-render.com) — capture screenshots of any website as PNG, JPEG, WebP, or PDF.

## Published Packages

| Package | Install | Links |
|---------|---------|-------|
| **MCP Server** | `npx snaprender-mcp` | [npm](https://www.npmjs.com/package/snaprender-mcp) |
| **Node.js SDK** | `npm install snaprender` | [npm](https://www.npmjs.com/package/snaprender) |
| **Python SDK** | `pip install snaprender` | [PyPI](https://pypi.org/project/snaprender/) |

## What's Inside

| Integration | Description | Setup Time |
|------------|-------------|------------|
| [MCP Server](./mcp-server/) | Model Context Protocol server for Claude Desktop & Claude Code | 30 sec |
| [OpenClaw Skill](./openclaw/) | Skill file for OpenClaw AI agent | 5 min |
| [ChatGPT Actions](./chatgpt-actions/) | OpenAPI spec for Custom GPTs and OpenAI function calling | 5 min |
| [Postman Collection](./postman/) | Pre-built API requests for Postman | 1 min |

## Quick Start

### MCP Server (Claude)

```json
{
  "mcpServers": {
    "snaprender": {
      "command": "npx",
      "args": ["-y", "snaprender-mcp"],
      "env": {
        "SNAPRENDER_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

### SDKs

```bash
# Node.js
npm install snaprender

# Python
pip install snaprender
```

### Direct API

```bash
curl "https://app.snap-render.com/v1/screenshot?url=https://example.com" \
  -H "X-API-Key: sk_live_your_key_here" \
  -o screenshot.png
```

## Get an API Key

Sign up free at [app.snap-render.com](https://app.snap-render.com/auth/signup) — 50 screenshots/month, no credit card required.

## Links

- [Documentation](https://snap-render.com)
- [Node.js SDK](https://www.npmjs.com/package/snaprender) (`npm install snaprender`)
- [Python SDK](https://pypi.org/project/snaprender/) (`pip install snaprender`)
- [MCP Server](https://www.npmjs.com/package/snaprender-mcp) (`npx snaprender-mcp`)
- [OpenAPI Spec](./chatgpt-actions/openapi.json)
- [Postman Collection](./postman/snaprender-postman-collection.json)

## License

MIT
