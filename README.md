<p align="center">
  <a href="https://snap-render.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://snap-render.com/brand/snaprender-lockup-dark.png">
      <img src="https://snap-render.com/brand/snaprender-lockup-light.png" alt="SnapRender" width="320">
    </picture>
  </a>
</p>

# SnapRender Integrations

[![SnapRender MCP connector: tool definition quality and endpoint health on Glama](https://glama.ai/mcp/connectors/com.snap-render.app/snap-render/badges/score.svg)](https://glama.ai/mcp/connectors/com.snap-render.app/snap-render)
[![smithery badge](https://smithery.ai/badge/snaprender/snaprender)](https://smithery.ai/server/snaprender/snaprender)
[![npm MCP](https://img.shields.io/npm/v/snaprender-mcp?label=MCP%20Server)](https://www.npmjs.com/package/snaprender-mcp)
[![npm SDK](https://img.shields.io/npm/v/snaprender?label=Node.js%20SDK)](https://www.npmjs.com/package/snaprender)
[![PyPI SDK](https://img.shields.io/pypi/v/snaprender?label=Python%20SDK)](https://pypi.org/project/snaprender/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Available on CodeGuilds](https://img.shields.io/badge/Available_on-CodeGuilds-6366f1)](https://codeguilds.dev/packages/snaprender-integrations)
[![MCP Badge](https://lobehub.com/badge/mcp/user0856-snaprender-integrations)](https://lobehub.com/mcp/user0856-snaprender-integrations)

Official integrations for the [SnapRender Screenshot API](https://snap-render.com): give AI agents eyes. Capture any public web page as PNG, JPEG, WebP or PDF, or read it as clean markdown.

## Remote MCP Server (recommended)

SnapRender runs a hosted MCP server. Connect from any MCP client with nothing to install:

```
https://app.snap-render.com/mcp
```

- **Transport:** [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http)
- **Sign in:** OAuth 2.0 (the client opens a SnapRender sign-in window; Google, GitHub or email), or an API key in the `Authorization: Bearer` or `X-API-Key` header
- **Tools (11):** capture, cache check, usage, signed links, content extraction, batches and webhooks ([full list below](#mcp-tools))
- **Prompts:** `screenshot_website`, `compare_devices`
- **Free plan:** 200 screenshots a month, no credit card
- **Directory listing:** [SnapRender on Glama](https://glama.ai/mcp/connectors/com.snap-render.app/snap-render) (health-checked, tool quality graded)

### Claude (claude.ai and Claude Desktop)

Open Customize, then Connectors, click + Add, then Add custom connector, and paste `https://app.snap-render.com/mcp`. Claude opens a SnapRender sign-in window; approve it and the tools are ready. Step-by-step guide: [snap-render.com/claude](https://snap-render.com/claude).

### Cursor, VS Code, Windsurf and other clients

Setup pages for each client, with one-click install where the client supports it: [snap-render.com/ai-connectors](https://snap-render.com/ai-connectors).

A client that takes headers instead of OAuth:

```json
{
  "mcpServers": {
    "snaprender": {
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

The server returns an `Mcp-Session-Id` header: include it in later requests to reuse the session.

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
| **Install** | None, just an HTTPS URL | Requires Node.js + npx |
| **Transport** | Streamable HTTP | stdio |
| **Sign in** | OAuth or API key | API key (`SNAPRENDER_API_KEY`) |
| **Use case** | Claude, ChatGPT, Cursor, any MCP client | Clients that only run local servers |

## MCP Tools

The hosted server and the npm package expose the same 11 tools. Parameters are documented in each tool's schema and in the [API docs](https://snap-render.com/docs#mcp-server).

| Tool | What it does | Cost |
|------|--------------|------|
| `take_screenshot` | Capture a URL as PNG, JPEG, WebP or PDF: device presets, full page, dark mode, ad and cookie banner removal, hide or click selectors | 1 capture (cached copies free) |
| `check_screenshot_cache` | Check whether a capture with these options is already cached | Free |
| `get_usage` | Captures used and left this month, the limit and the reset date | Free |
| `sign_screenshot_url` | Create a signed link that renders a screenshot when opened, no API key needed | 1 capture when opened |
| `extract_content` | Read a page as markdown, text, HTML, article, links or metadata | 1 capture (failures free) |
| `batch_screenshots` | Capture up to 50 URLs in one background job | 1 capture per URL (failures refunded) |
| `get_batch_status` | Poll a batch job and get its download links | Free |
| `list_webhooks` | List webhook subscriptions | Free |
| `create_webhook` | Get notified when a batch finishes, the quota runs low, or a scheduled capture changes | Free |
| `delete_webhook` | Delete a webhook subscription | Free |
| `test_webhook` | Send a test payload to a webhook | Free |

## Agent Framework Integrations

| Framework | Directory | Description |
|-----------|-----------|-------------|
| [LangChain Python](./langchain/) | `langchain/` | `@tool` decorated functions for LangChain / LangGraph agents ([PyPI](https://pypi.org/project/langchain-snaprender/)) |
| [LangChain.js](./langchain-js/) | `langchain-js/` | `StructuredTool` classes for LangChain.js agents ([npm](https://www.npmjs.com/package/langchain-snaprender)) |
| [CrewAI](./crewai/) | `crewai/` | `BaseTool` subclasses for CrewAI agents ([PyPI](https://pypi.org/project/crewai-snaprender/)) |
| [AutoGen](./autogen/) | `autogen/` | `FunctionTool` wrappers for Microsoft AutoGen agents ([PyPI](https://pypi.org/project/autogen-ext-snaprender/)) |
| [n8n](https://github.com/User0856/n8n-nodes-snaprender) | Separate repo | Community node for n8n workflows ([npm](https://www.npmjs.com/package/n8n-nodes-snaprender)) |

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

Sign up free at [snap-render.com](https://snap-render.com/auth/signup): 200 screenshots a month, no credit card required.

## Links

- [Documentation](https://snap-render.com/docs)
- [Remote MCP Server](https://app.snap-render.com/mcp): Streamable HTTP endpoint
- [MCP Connector on Glama](https://glama.ai/mcp/connectors/com.snap-render.app/snap-render)
- [MCP Server on npm](https://www.npmjs.com/package/snaprender-mcp) (`npx snaprender-mcp`)
- [MCP Server on Smithery](https://smithery.ai/server/snaprender/snaprender)
- [Node.js SDK](https://www.npmjs.com/package/snaprender) (`npm install snaprender`)
- [Python SDK](https://pypi.org/project/snaprender/) (`pip install snaprender`)
- [LangChain Python Tool](https://pypi.org/project/langchain-snaprender/) (`pip install langchain-snaprender`)
- [LangChain.js Tool](https://www.npmjs.com/package/langchain-snaprender) (`npm install langchain-snaprender`)
- [CrewAI Tool](https://pypi.org/project/crewai-snaprender/) (`pip install crewai-snaprender`)
- [AutoGen Tool](https://pypi.org/project/autogen-ext-snaprender/) (`pip install autogen-ext-snaprender`)
- [n8n Community Node](https://www.npmjs.com/package/n8n-nodes-snaprender) (`npm install n8n-nodes-snaprender`)
- [OpenAPI Spec](./chatgpt-actions/openapi.json)
- [Postman Collection](./postman/snaprender-postman-collection.json)

## License

MIT
