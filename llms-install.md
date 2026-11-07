# Installing SnapRender MCP

Instructions for AI agents and humans. No build step, no clone required.

## Requirements

- Node.js 20 or newer
- A SnapRender API key. Free plan: 200 captures a month, no card. Get one at https://app.snap-render.com

## Install (stdio, recommended)

Add this to the MCP client configuration:

```json
{
  "mcpServers": {
    "snaprender": {
      "command": "npx",
      "args": ["-y", "snaprender-mcp"],
      "env": { "SNAPRENDER_API_KEY": "sk_live_your_key_here" }
    }
  }
}
```

Replace `sk_live_your_key_here` with the real key. The server starts on demand and speaks stdio.

## Install (hosted, no local process)

Point the client at the hosted MCP endpoint instead:

```
https://app.snap-render.com/mcp
```

Transport: Streamable HTTP. Auth: OAuth, or an API key as a Bearer token.

## Verify

Ask the agent: `take a screenshot of https://example.com and describe it`.
It should call the `take_screenshot` tool and return an image or a URL.

## Tools

| Tool | What it does |
|---|---|
| `take_screenshot` | Capture a URL as PNG, JPEG, WebP or PDF. Parameters: `url`, `format`, `width`, `height`, `full_page`, `device`, `dark_mode`, `block_ads`, `block_cookie_banners`, `quality`, `delay`, `hide_selectors` |

## Troubleshooting

- `401` means the API key is missing or wrong.
- If `npx` is slow on first run, it is downloading the package; subsequent starts are fast.
- Corporate proxies: set `HTTPS_PROXY` in the `env` block.

## Links

- Site: https://snap-render.com
- Docs: https://snap-render.com/docs
- MCP setup for Claude: https://snap-render.com/claude
