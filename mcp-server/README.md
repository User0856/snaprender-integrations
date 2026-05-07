# snaprender-mcp

[![smithery badge](https://smithery.ai/badge/snaprender/snaprender)](https://smithery.ai/server/snaprender/snaprender)
[![npm](https://img.shields.io/npm/v/snaprender-mcp)](https://www.npmjs.com/package/snaprender-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

MCP (Model Context Protocol) server for [SnapRender Screenshot API](https://snap-render.com). Lets AI agents like Claude capture website screenshots, check cache status, and monitor usage.

**Published on npm:** [`snaprender-mcp`](https://www.npmjs.com/package/snaprender-mcp)

## Quick Start

### With Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

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

### With Claude Code

Add to your project's `.mcp.json`:

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

### Remote Mode (no install)

Connect any MCP client directly to the hosted server — zero dependencies, works instantly:

```
https://app.snap-render.com/mcp
```

Uses [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) (MCP spec 2025-03-26). Authenticate via `Authorization: Bearer sk_live_...` or `X-API-Key` header.

#### Claude Desktop (remote)

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

#### Any MCP client (curl example)

```bash
# Initialize a session
curl -X POST https://app.snap-render.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-API-Key: sk_live_your_key_here" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

The server returns an `Mcp-Session-Id` header — pass it in subsequent requests to reuse the session.

### Local vs Remote

| | Local (`npx`) | Remote (hosted) |
|---|---|---|
| **Install** | Requires Node.js + npx | None — just an HTTPS URL |
| **Transport** | stdio | Streamable HTTP |
| **Latency** | Slightly lower (local process) | Slightly higher (network hop) |
| **Use case** | Claude Desktop, Claude Code | Any MCP client, Smithery, web apps |

## Tools (11 total)

### `take_screenshot`

Capture a screenshot of any website.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to capture |
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

### `extract_content`

Extract content from a web page as markdown, text, HTML, links, or metadata.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to extract from |
| `type` | string | No | `markdown`, `text`, `html`, `article`, `links`, or `metadata` (default: `markdown`) |

### `batch_screenshots`

Capture up to 50 URLs in a single batch job. Returns a job ID for polling.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `urls` | string[] | Yes | Array of URLs (max 50) |
| `format` | string | No | Output format (default: `png`) |
| `width` | integer | No | Viewport width |
| `height` | integer | No | Viewport height |

### `get_batch_status`

Poll a batch job for completion status and download URLs.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | string | Yes | Batch job ID from `batch_screenshots` |

### `sign_screenshot_url`

Generate a signed URL that renders a screenshot when visited. No API key needed to use the URL.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to screenshot |
| `expires_in` | integer | No | Expiry in seconds (default: 86400) |
| `format` | string | No | Output format |

### `check_screenshot_cache`

Check if a screenshot is cached without capturing.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to check |
| `format` | string | No | Output format |

### `list_webhooks`

List all webhook subscriptions for your account. Read-only.

### `create_webhook`

Create a new webhook subscription.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | HTTPS webhook endpoint URL |
| `events` | string[] | Yes | Events: `screenshot.completed`, `quota.warning`, `quota.exceeded` |

### `delete_webhook`

Delete a webhook subscription. Destructive.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `webhook_id` | string | Yes | ID of the webhook to delete |

### `test_webhook`

Send a test event to a webhook endpoint to verify delivery.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `webhook_id` | string | Yes | ID of the webhook to test |

### `get_usage`

Get screenshot usage statistics.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `month` | string | No | Month in `YYYY-MM` format (default: current month) |

## Get an API Key

Sign up for free at [snap-render.com](https://snap-render.com/auth/signup) — 200 screenshots/month, no credit card required.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SNAPRENDER_API_KEY` | Yes | Your API key (starts with `sk_live_`) |
| `SNAPRENDER_URL` | No | API base URL (default: `https://app.snap-render.com`) |

## Privacy Policy

This MCP server connects to the SnapRender API at `app.snap-render.com`. When you use it:

- **Data sent:** URLs you provide for screenshots/extraction, plus screenshot parameters. No conversation data, chat history, or Claude memory is accessed or collected.
- **Data stored:** URLs are logged temporarily (up to 90 days) for debugging and abuse prevention. Screenshots are cached based on your plan settings and automatically deleted after the cache TTL expires.
- **Authentication:** Your API key is stored locally (in your environment or MCP config) and sent to the SnapRender API via HTTPS. It is never shared with third parties.
- **Third parties:** Stripe (payments), Resend (transactional emails), Cloudflare (DNS/CDN). No data is sold or shared for advertising.

Full policy: [https://snap-render.com/privacy](https://snap-render.com/privacy)

## Related

- [Node.js SDK](https://www.npmjs.com/package/snaprender) — `npm install snaprender`
- [Python SDK](https://pypi.org/project/snaprender/) — `pip install snaprender`
- [OpenClaw Skill](../openclaw/) — Screenshot skill for OpenClaw agents
- [ChatGPT Actions](../chatgpt-actions/) — OpenAPI spec for Custom GPTs
- [Postman Collection](../postman/) — Pre-built API requests

## License

MIT
