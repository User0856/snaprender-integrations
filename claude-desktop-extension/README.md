# SnapRender - Claude Desktop Extension

Claude Desktop extension for the [SnapRender Screenshot API](https://snap-render.com). Gives Claude the ability to capture website screenshots, extract page content, and render HTML/Markdown to images.

## Install

1. Download the latest `.mcpb` file from [Releases](https://github.com/User0856/snaprender-integrations/releases)
2. Double-click to install in Claude Desktop (or Settings > Extensions > Advanced > Install Extension)
3. Enter your API key when prompted (get one free at [snap-render.com](https://snap-render.com/auth/signup))

## Tools

### take_screenshot

Capture any website as PNG, JPEG, WebP, or PDF.

```
"Screenshot https://example.com on iPhone in dark mode"
"Capture the full page of https://news.ycombinator.com as a PDF"
"Take a screenshot of my staging site at 1920x1080"
```

Options: device emulation (iPhone 14/15 Pro, Pixel 7, iPad Pro, MacBook Pro), dark mode, ad blocking, cookie banner removal, full-page capture, custom viewport, CSS selector hiding/clicking, caching.

### extract_content

Pull content from any web page as markdown, plain text, HTML, article data, links, or metadata.

```
"Extract the main article from https://blog.example.com/post as markdown"
"Get all links from https://example.com"
"Extract metadata (title, description, OG tags) from this URL"
```

### batch_screenshots

Capture up to 50 URLs in a single request. Returns presigned download URLs.

```
"Screenshot all 10 pages in this sitemap"
"Capture these competitor homepages side by side"
```

### sign_screenshot_url

Generate a signed URL that renders a screenshot when visited. Works without an API key. Use for embedding in emails, documents, or sharing.

```
"Create a signed screenshot URL for https://example.com that expires in 7 days"
```

### check_screenshot_cache

Check if a screenshot is already cached (does not use quota).

### manage_webhooks

Create, list, delete, or test webhook subscriptions. Events: screenshot.completed, quota.warning, quota.exceeded.

### get_usage

Check how many screenshots you've used this month and how many remain.

## Get an API Key

Sign up free at [snap-render.com](https://snap-render.com/auth/signup). 200 screenshots/month, all features, no credit card.

## Build from Source

```bash
cd claude-desktop-extension
npm install -g @anthropic-ai/mcpb
./build.sh
```

This compiles the MCP server, copies production dependencies, and packs the `.mcpb` file.

## Alternative Setup (no extension)

If you prefer manual configuration, add this to your Claude Desktop config:

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

Or use the remote server (zero install):

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

## Links

- [API Docs](https://snap-render.com/docs)
- [SDKs](https://snap-render.com/sdks) (Node.js, Python, Go)
- [npm: snaprender-mcp](https://www.npmjs.com/package/snaprender-mcp)
- [MCP Registry](https://registry.modelcontextprotocol.io)
- [Privacy Policy](https://snap-render.com/privacy)

## License

MIT
