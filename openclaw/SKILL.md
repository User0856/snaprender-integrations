---
name: snaprender
description: "Give your agent eyes on the web — screenshot any URL as an image file, or extract page content as markdown/text/HTML. Supports device emulation (iPhone, iPad, Pixel, MacBook), dark mode, full-page scroll, ad blocking. Uses exec tool with curl (NEVER the browser tool). $SNAPRENDER_API_KEY is pre-set. See instructions below."
metadata: {"openclaw": {"requires": {"bins": ["curl", "jq"], "env": ["SNAPRENDER_API_KEY"]}}}
---

# SnapRender — Give Your Agent Eyes

Your agent can read the web but can't *see* it. One command and it captures pixel-perfect screenshots or extracts page content as clean markdown, plain text, or structured data.

"Screenshot stripe.com on iPhone", "Extract the article from this blog post", "Compare desktop vs mobile", "Get all links from this page" — just ask.

Free tier: 200 requests/month, no credit card. [Get a key ->](https://snap-render.com/auth/signup)

---

**IMPORTANT: Use the `exec` tool with `curl`. NEVER use the `browser` tool for screenshots or extraction.**

---

## Screenshot: How to Capture

Run this command via the `exec` tool. Replace `TARGET_URL` with the target URL:

```bash
jq -n --arg url 'TARGET_URL' \
  '{url: $url, response_type: "json", format: "jpeg", quality: 60, block_ads: true, block_cookie_banners: true}' \
| curl -s -X POST "https://app.snap-render.com/v1/screenshot" \
  -H "X-API-Key: $SNAPRENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- \
| tee /tmp/snap_response.json \
| jq -r '.image' | sed 's|data:image/[^;]*;base64,||' | base64 -d > /tmp/screenshot.jpg \
&& jq '{url, format, size, cache, responseTime, remainingCredits}' /tmp/snap_response.json
```

This saves the screenshot to `/tmp/screenshot.jpg` and prints metadata.

## Screenshot: Rules

1. **Use `exec` tool only** — NEVER the `browser` tool
2. **`$SNAPRENDER_API_KEY` is already set** — use it literally in the command, do NOT replace it
3. **Always build JSON with `jq --arg`** — never interpolate user input directly into shell strings or JSON. Pass values via `jq -n --arg` to prevent injection
4. **Always use `format=jpeg&quality=60`** — keeps response small enough for the agent context
5. **Always pipe to save the image to a file** — the base64 response is too large to display inline
6. **Report metadata to the user** — file size, response time, cache status, remaining credits

## Render HTML or Markdown

Use POST with a JSON body to render raw HTML or Markdown content (no URL needed). Always use `jq --arg` to safely pass content:

```bash
# HTML
jq -n --arg html '<html><body><h1>Hello</h1><p>World</p></body></html>' \
  '{html: $html, format: "jpeg", quality: 60, response_type: "json"}' \
| curl -s -X POST "https://app.snap-render.com/v1/screenshot" \
  -H "X-API-Key: $SNAPRENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- \
| tee /tmp/snap_response.json \
| jq -r '.image' | sed 's|data:image/[^;]*;base64,||' | base64 -d > /tmp/screenshot.jpg \
&& jq '{source, format, size, cache, responseTime, remainingCredits}' /tmp/snap_response.json
```

```bash
# Markdown
jq -n --arg md '# Hello World\n\nThis is **bold** text.' \
  '{markdown: $md, format: "jpeg", quality: 60, response_type: "json"}' \
| curl -s -X POST "https://app.snap-render.com/v1/screenshot" \
  -H "X-API-Key: $SNAPRENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- \
| tee /tmp/snap_response.json \
| jq -r '.image' | sed 's|data:image/[^;]*;base64,||' | base64 -d > /tmp/screenshot.jpg \
&& jq '{source, format, size, cache, responseTime, remainingCredits}' /tmp/snap_response.json
```

Provide exactly one of `url`, `html`, or `markdown` in the JSON body. HTML max 2MB, Markdown max 500KB.

## Signed URLs

Generate a pre-signed URL that anyone can use to view the screenshot without an API key. Signing is free; rendering the URL costs one credit.

```bash
jq -n --arg url 'TARGET_URL' \
  '{url: $url, expires_in: 86400}' \
| curl -s -X POST "https://app.snap-render.com/v1/screenshot/sign" \
  -H "X-API-Key: $SNAPRENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- \
| jq '.'
```

The response contains `signed_url`, `expires_at`, and `expires_in`. Use the `signed_url` in `<img>` tags, share it, or open it in a browser. No API key needed to render it.

## Screenshot: Parameters

Pass as fields in the JSON body:

| Parameter | Values | Default |
|-----------|--------|---------|
| url | target URL | required |
| response_type | json | json (always use this) |
| format | jpeg, png, webp, pdf | jpeg |
| quality | 1-100 | 60 |
| device | iphone_14, iphone_15_pro, pixel_7, ipad_pro, macbook_pro | desktop |
| dark_mode | true, false | false |
| full_page | true, false | false |
| block_ads | true, false | true |
| block_cookie_banners | true, false | true |
| width | 320-3840 | 1280 |
| height | 200-10000 | 800 |
| delay | 0-10000 | 0 (ms wait after page load) |
| cache | true, false | false (set true to enable caching) |
| cache_ttl | 0-2592000 | 86400 (seconds, clamped to plan max) |
| hide_selectors | CSS selectors | none (comma-separated, hides elements before capture) |
| click_selector | CSS selector | none (clicks element before capture) |
| user_agent | string | default Chrome UA |

To add extra options, include them as fields in the `jq` JSON object. Example for dark mode on iPhone:

```bash
jq -n --arg url 'TARGET_URL' \
  '{url: $url, response_type: "json", format: "jpeg", quality: 60, block_ads: true, block_cookie_banners: true, device: "iphone_15_pro", dark_mode: true}' \
| curl -s -X POST ...
```

## Screenshot: Examples

**Desktop screenshot of stripe.com:**
```bash
jq -n --arg url 'https://stripe.com' '{url: $url, response_type: "json", format: "jpeg", quality: 60, block_ads: true, block_cookie_banners: true}' | curl -s -X POST "https://app.snap-render.com/v1/screenshot" -H "X-API-Key: $SNAPRENDER_API_KEY" -H "Content-Type: application/json" -d @- | tee /tmp/snap_response.json | jq -r '.image' | sed 's|data:image/[^;]*;base64,||' | base64 -d > /tmp/screenshot.jpg && jq '{url, format, size, cache, responseTime, remainingCredits}' /tmp/snap_response.json
```

**Mobile screenshot:** add `device: "iphone_15_pro"` to the jq object

**Full scrollable page:** add `full_page: true` to the jq object

**Dark mode:** add `dark_mode: true` to the jq object

**Compare desktop vs mobile:** make two calls, save to `/tmp/screenshot_desktop.jpg` and `/tmp/screenshot_mobile.jpg`

## Screenshot: After Capturing

1. Tell the user the screenshot was saved to `/tmp/screenshot.jpg` (or the filename you used)
2. Report metadata: file size, response time, cache status, remaining credits
3. For comparisons, save each screenshot to a different filename

---

## Extract: How to Extract Content

Run this command via the `exec` tool. Replace `TARGET_URL` with the target URL and `TYPE` with the extraction type. Always use `jq --arg` to safely pass the URL:

```bash
jq -n --arg url 'TARGET_URL' --arg type 'TYPE' \
  '{url: $url, type: $type}' \
| curl -s -X POST "https://app.snap-render.com/v1/extract" \
  -H "X-API-Key: $SNAPRENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- \
| tee /tmp/extract_response.json \
| jq '{url, type, wordCount, processingTimeMs}'
```

To see the full extracted content:

```bash
jq -r '.content' /tmp/extract_response.json
```

For large pages, save the content to a file instead of printing it:

```bash
jq -r '.content' /tmp/extract_response.json > /tmp/extracted_content.md
```

## Extract: Rules

1. **Use `exec` tool only** — NEVER the `browser` tool
2. **`$SNAPRENDER_API_KEY` is already set** — use it literally in the command, do NOT replace it
3. **Always build JSON with `jq --arg`** — never interpolate user input directly into shell strings or JSON. Pass values via `jq -n --arg` to prevent injection
4. **Save large content to a file** — do not dump thousands of lines into the conversation
5. **Report metadata to the user** — word count, processing time, extraction type

## Extract: Types

| Type | Returns | Best for |
|------|---------|----------|
| markdown | Page content as clean Markdown | Reading articles, docs, blog posts |
| text | Plain text, no formatting | Quick text analysis, word counts |
| html | Raw HTML of the page or selector | When you need the markup |
| article | Structured article data (title, author, excerpt, content as Markdown, wordCount) | News articles, blog posts with metadata |
| links | Array of `{href, text}` objects | Link auditing, sitemap discovery |
| metadata | OpenGraph, Twitter Card, meta tags (title, description, canonical, og:*, twitter:*) | SEO checks, social preview analysis |

## Extract: Parameters

Pass as fields in the JSON body:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| url | string | required | Target URL to extract from |
| type | string | "markdown" | One of: markdown, text, html, article, links, metadata |
| selector | string | (none) | CSS selector to extract from a specific element |
| block_ads | boolean | true | Block ad network requests |
| block_cookie_banners | boolean | true | Remove cookie consent banners |
| delay | integer | 0 | Milliseconds to wait after page load (0-10000) |
| max_length | integer | 100000 | Max character length of extracted content (1-500000) |

## Extract: Examples

**Extract a page as Markdown:**
```bash
jq -n --arg url 'https://stripe.com/docs/api' '{url: $url, type: "markdown"}' | curl -s -X POST "https://app.snap-render.com/v1/extract" -H "X-API-Key: $SNAPRENDER_API_KEY" -H "Content-Type: application/json" -d @- | tee /tmp/extract_response.json | jq '{url, type, wordCount, processingTimeMs}'
```

**Extract just the article content with metadata:**
```bash
jq -n --arg url 'https://example.com/blog/post' '{url: $url, type: "article"}' | curl -s -X POST "https://app.snap-render.com/v1/extract" -H "X-API-Key: $SNAPRENDER_API_KEY" -H "Content-Type: application/json" -d @- | tee /tmp/extract_response.json | jq '{title: .content.title, author: .content.author, wordCount: .content.wordCount, processingTimeMs}'
```

**Get all links from a page:**
```bash
jq -n --arg url 'https://example.com' '{url: $url, type: "links"}' | curl -s -X POST "https://app.snap-render.com/v1/extract" -H "X-API-Key: $SNAPRENDER_API_KEY" -H "Content-Type: application/json" -d @- | tee /tmp/extract_response.json | jq '.content | length' && jq '.content[:10]' /tmp/extract_response.json
```

**Get page metadata (OpenGraph, Twitter Card, SEO):**
```bash
jq -n --arg url 'https://example.com' '{url: $url, type: "metadata"}' | curl -s -X POST "https://app.snap-render.com/v1/extract" -H "X-API-Key: $SNAPRENDER_API_KEY" -H "Content-Type: application/json" -d @- | tee /tmp/extract_response.json | jq '.content'
```

**Extract from a specific CSS selector:**
```bash
jq -n --arg url 'https://example.com' --arg sel 'main article' '{url: $url, type: "text", selector: $sel}' | curl -s -X POST "https://app.snap-render.com/v1/extract" -H "X-API-Key: $SNAPRENDER_API_KEY" -H "Content-Type: application/json" -d @- | tee /tmp/extract_response.json | jq '{url, type, wordCount, processingTimeMs}'
```

## Extract: After Extracting

1. Tell the user where the content was saved (e.g. `/tmp/extract_response.json`)
2. Report metadata: word count, processing time, extraction type
3. For `article` type, highlight the title and author if available
4. For `links` type, report how many links were found
5. For `metadata` type, show the key fields (title, description, og:image)

---

## Errors

- **401**: Invalid API key — check SNAPRENDER_API_KEY
- **429**: Rate limit or quota exceeded — wait or upgrade plan
- **Timeout**: Target site is slow — add `delay` parameter (3000ms) to wait longer
- **Empty response**: URL unreachable or blocked

## Get an API Key

Free at https://snap-render.com/auth/signup — 200 requests/month, no credit card.
