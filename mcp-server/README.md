# snaprender-mcp

MCP (Model Context Protocol) server for [SnapRender Screenshot API](https://snap-render.com). Lets AI agents like Claude capture website screenshots, check cache status, and monitor usage.

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

## Tools

### `take_screenshot`

Capture a screenshot of any website.

**Parameters:**
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

### `check_screenshot_cache`

Check if a screenshot is cached without capturing.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to check |
| `format` | string | No | Output format |

### `get_usage`

Get current month's usage statistics. No parameters required.

## Get an API Key

Sign up for free at [app.snap-render.com](https://app.snap-render.com/auth/signup) — 50 screenshots/month, no credit card required.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SNAPRENDER_API_KEY` | Yes | Your API key (starts with `sk_live_`) |
| `SNAPRENDER_URL` | No | API base URL (default: `https://app.snap-render.com`) |

## License

MIT
