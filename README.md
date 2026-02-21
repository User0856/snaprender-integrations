# SnapRender Integrations

[![smithery badge](https://smithery.ai/badge/snaprender/snaprender)](https://smithery.ai/server/snaprender/snaprender)
[![npm MCP](https://img.shields.io/npm/v/snaprender-mcp?label=MCP%20Server)](https://www.npmjs.com/package/snaprender-mcp)
[![npm SDK](https://img.shields.io/npm/v/snaprender?label=Node.js%20SDK)](https://www.npmjs.com/package/snaprender)
[![PyPI SDK](https://img.shields.io/pypi/v/snaprender?label=Python%20SDK)](https://pypi.org/project/snaprender/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Official integrations for [SnapRender Screenshot API](https://snap-render.com) — capture screenshots of any website as PNG, JPEG, WebP, or PDF.

## Remote MCP Server

SnapRender runs a hosted MCP server — connect from any MCP client with zero install:

```
https://app.snap-render.com/mcp
```

- **Transport:** [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) (MCP spec 2025-03-26)
- **Auth:** `X-API-Key` header or `Authorization: Bearer` header
- **Tools:** `take_screenshot`, `check_screenshot_cache`, `get_usage`
- **Prompts:** `screenshot_website`, `compare_devices`

### Claude Desktop (remote — recommended)

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

### Any MCP client (curl)

```bash
# Initialize a session
curl -X POST https://app.snap-render.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-API-Key: sk_live_your_key_here" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

The server returns an `Mcp-Session-Id` header — include it in subsequent requests to reuse the session.

### Smithery

Install via [Smithery](https://smithery.ai/server/snaprender/snaprender) for automatic setup with any MCP client.

## Local MCP Server (npm)

If you prefer running locally via stdio transport:

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

See [mcp-server/](./mcp-server/) for full documentation.

### Remote vs Local

| | Remote (hosted) | Local (`npx`) |
|---|---|---|
| **Install** | None — just an HTTPS URL | Requires Node.js + npx |
| **Transport** | Streamable HTTP | stdio |
| **Use case** | Any MCP client, Smithery, web apps | Claude Desktop, Claude Code |

## MCP Tools

### `take_screenshot`

Capture a screenshot of any website. Returns the image as PNG, JPEG, WebP, or PDF.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to capture (http:// or https://) |
| `format` | string | No | `png`, `jpeg`, `webp`, or `pdf` (default: `png`) |
| `width` | integer | No | Viewport width 320-3840 (default: 1280) |
| `height` | integer | No | Viewport height 200-10000 (default: 800) |
| `full_page` | boolean | No | Capture entire scrollable page |
| `device` | string | No | `iphone_14`, `iphone_15_pro`, `pixel_7`, `ipad_pro`, `macbook_pro` |
| `dark_mode` | boolean | No | Enable dark mode |
| `block_ads` | boolean | No | Block ads (default: true) |
| `block_cookie_banners` | boolean | No | Remove cookie banners (default: true) |
| `quality` | integer | No | JPEG/WebP quality 1-100 (default: 90) |
| `delay` | integer | No | Wait ms after page load (default: 0) |
| `hide_selectors` | string | No | Comma-separated CSS selectors to hide |
| `click_selector` | string | No | CSS selector to click before capture |

### `check_screenshot_cache`

Check if a screenshot is cached without capturing. Does not count against quota.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to check |
| `format` | string | No | Output format (default: `png`) |

### `get_usage`

Get screenshot usage statistics.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `month` | string | No | Month in `YYYY-MM` format (default: current month) |

## Agent Framework Integrations

| Framework | Directory | Description |
|-----------|-----------|-------------|
| [LangChain Python](./langchain/) | `langchain/` | `@tool` decorated functions for LangChain / LangGraph agents ([PyPI](https://pypi.org/project/langchain-snaprender/)) |
| [LangChain.js](./langchain-js/) | `langchain-js/` | `StructuredTool` classes for LangChain.js agents ([npm](https://www.npmjs.com/package/langchain-snaprender)) |
| [CrewAI](./crewai/) | `crewai/` | `BaseTool` subclasses for CrewAI agents |
| [AutoGen](./autogen/) | `autogen/` | `FunctionTool` wrappers for Microsoft AutoGen agents |
| [n8n](./n8n/) | `n8n/` | Community node for n8n workflows ([npm](https://www.npmjs.com/package/n8n-nodes-snaprender)) |

## Other Integrations

| Integration | Description | Setup Time |
|------------|-------------|------------|
| [OpenClaw Skill](./openclaw/) | Skill file for OpenClaw AI agent | 5 min |
| [ChatGPT Actions](./chatgpt-actions/) | OpenAPI spec for Custom GPTs and OpenAI function calling | 5 min |
| [Postman Collection](./postman/) | Pre-built API requests for Postman | 1 min |

## SDKs

```bash
# Node.js
npm install snaprender

# Python
pip install snaprender
```

## Direct API

```bash
curl "https://app.snap-render.com/v1/screenshot?url=https://example.com" \
  -H "X-API-Key: sk_live_your_key_here" \
  -o screenshot.png
```

## Get an API Key

Sign up free at [app.snap-render.com](https://app.snap-render.com/auth/signup) — 50 screenshots/month, no credit card required.

## Links

- [Documentation](https://snap-render.com)
- [Remote MCP Server](https://app.snap-render.com/mcp) — Streamable HTTP endpoint
- [MCP Server on npm](https://www.npmjs.com/package/snaprender-mcp) (`npx snaprender-mcp`)
- [MCP Server on Smithery](https://smithery.ai/server/snaprender/snaprender)
- [Node.js SDK](https://www.npmjs.com/package/snaprender) (`npm install snaprender`)
- [Python SDK](https://pypi.org/project/snaprender/) (`pip install snaprender`)
- [LangChain Python Tool](https://pypi.org/project/langchain-snaprender/) (`pip install langchain-snaprender`)
- [LangChain.js Tool](https://www.npmjs.com/package/langchain-snaprender) (`npm install langchain-snaprender`)
- [n8n Community Node](https://www.npmjs.com/package/n8n-nodes-snaprender) (`npm install n8n-nodes-snaprender`)
- [OpenAPI Spec](./chatgpt-actions/openapi.json)
- [Postman Collection](./postman/snaprender-postman-collection.json)

## License

MIT
