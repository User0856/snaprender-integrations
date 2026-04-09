---
name: snaprender
description: "Give your agent eyes on the web — screenshot any URL as an image file, or extract page content as markdown/text/HTML. Supports device emulation (iPhone, iPad, Pixel, MacBook), dark mode, full-page scroll, ad blocking. Uses exec tool with curl (NEVER the browser tool). $SNAPRENDER_API_KEY is pre-set. See instructions below."
metadata: {"openclaw": {"requires": {"bins": ["curl", "jq"], "env": ["SNAPRENDER_API_KEY"]}}}
---

# SnapRender — Give Your Agent Eyes

Your agent can read the web but can't *see* it. One command and it captures pixel-perfect screenshots or extracts page content as clean markdown, plain text, or structured data.

"Screenshot stripe.com on iPhone", "Extract the article from this blog post", "Compare desktop vs mobile", "Get all links from this page" — just ask.

Free tier: 500 requests/month, no credit card. [Get a key →](https://snap-render.com/auth/signup)

---

**IMPORTANT: Use the `exec` tool with `curl`. NEVER use the `browser` tool for screenshots or extraction.**

---

## Screenshot: How to Capture

Run this command via the `exec` tool. Replace `ENCODED_URL` with the URL-encoded target (e.g. `https%3A%2F%2Fstripe.com`):

```bash
curl -s "https://app.snap-render.com/v1/screenshot?url=ENCODED_URL&response_type=json&format=jpeg&quality=60&block_ads=true&block_cookie_banners=true" \
  -H "X-API-Key: $SNAPRENDER_API_KEY" \
  | tee /tmp/snap_response.json \
  | jq -r '.image' | sed 's|data:image/[^;]*;base64,||' | base64 -d > /tmp/screenshot.jpg \
  && jq '{url, format, size, cache, responseTime, remainingCredits}' /tmp/snap_response.json
```

This saves the screenshot to `/tmp/screenshot.jpg` and prints metadata.

## Screenshot: Rules

1. **Use `exec` tool only** — NEVER the `browser` tool
2. **`$SNAPRENDER_API_KEY` is already set** — use it literally in the command, do NOT replace it
3. **URL-encode the target** — `https://stripe.com` → `https%3A%2F%2Fstripe.com`
4. **Always use `format=jpeg&quality=60`** — keeps response small enough for the agent context
5. **Always pipe to save the image to a file** — the base64 response is too large to display inline
6. **Report metadata to the user** — file size, response time, cache status, remaining credits

## Screenshot: Parameters

Add as query parameters to the URL:

| Parameter | Values | Default |
|-----------|--------|---------|
| url | URL-encoded target | required |
| response_type | json | json (always use this) |
| format | jpeg, png, webp | jpeg |
| quality | 1-100 | 60 |
| device | iphone_15_pro, pixel_7, ipad_pro, macbook_pro | desktop |
| dark_mode | true, false | false |
| full_page | true, false | false |
| block_ads | true, false | true |
| block_cookie_banners | true, false | true |
| width | 320-3840 | 1280 |
| height | 200-10000 | 800 |
| delay | 0-10000 | 0 (ms wait after page load) |

## Screenshot: Examples

**Desktop screenshot of stripe.com:**
```bash
curl -s "https://app.snap-render.com/v1/screenshot?url=https%3A%2F%2Fstripe.com&response_type=json&format=jpeg&quality=60&block_ads=true&block_cookie_banners=true" -H "X-API-Key: $SNAPRENDER_API_KEY" | tee /tmp/snap_response.json | jq -r '.image' | sed 's|data:image/[^;]*;base64,||' | base64 -d > /tmp/screenshot.jpg && jq '{url, format, size, cache, responseTime, remainingCredits}' /tmp/snap_response.json
```

**Mobile screenshot:** add `&device=iphone_15_pro` to the URL

**Full scrollable page:** add `&full_page=true` to the URL

**Dark mode:** add `&dark_mode=true` to the URL

**Compare desktop vs mobile:** make two calls, save to `/tmp/screenshot_desktop.jpg` and `/tmp/screenshot_mobile.jpg`

## Screenshot: After Capturing

1. Tell the user the screenshot was saved to `/tmp/screenshot.jpg` (or the filename you used)
2. Report metadata: file size, response time, cache status, remaining credits
3. For comparisons, save each screenshot to a different filename

---

## Extract: How to Extract Content

Run this command via the `exec` tool. Replace `ENCODED_URL` with the URL-encoded target and `TYPE` with the extraction type:

```bash
curl -s -X POST "https://app.snap-render.com/v1/extract" \
  -H "X-API-Key: $SNAPRENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "TARGET_URL", "type": "TYPE"}' \
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
3. **Use the POST method** — send URL and options as JSON body
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

Send as JSON body fields with POST:

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
curl -s -X POST "https://app.snap-render.com/v1/extract" -H "X-API-Key: $SNAPRENDER_API_KEY" -H "Content-Type: application/json" -d '{"url": "https://stripe.com/docs/api", "type": "markdown"}' | tee /tmp/extract_response.json | jq '{url, type, wordCount, processingTimeMs}'
```

**Extract just the article content with metadata:**
```bash
curl -s -X POST "https://app.snap-render.com/v1/extract" -H "X-API-Key: $SNAPRENDER_API_KEY" -H "Content-Type: application/json" -d '{"url": "https://example.com/blog/post", "type": "article"}' | tee /tmp/extract_response.json | jq '{title: .content.title, author: .content.author, wordCount: .content.wordCount, processingTimeMs}'
```

**Get all links from a page:**
```bash
curl -s -X POST "https://app.snap-render.com/v1/extract" -H "X-API-Key: $SNAPRENDER_API_KEY" -H "Content-Type: application/json" -d '{"url": "https://example.com", "type": "links"}' | tee /tmp/extract_response.json | jq '.content | length' && jq '.content[:10]' /tmp/extract_response.json
```

**Get page metadata (OpenGraph, Twitter Card, SEO):**
```bash
curl -s -X POST "https://app.snap-render.com/v1/extract" -H "X-API-Key: $SNAPRENDER_API_KEY" -H "Content-Type: application/json" -d '{"url": "https://example.com", "type": "metadata"}' | tee /tmp/extract_response.json | jq '.content'
```

**Extract from a specific CSS selector:**
```bash
curl -s -X POST "https://app.snap-render.com/v1/extract" -H "X-API-Key: $SNAPRENDER_API_KEY" -H "Content-Type: application/json" -d '{"url": "https://example.com", "type": "text", "selector": "main article"}' | tee /tmp/extract_response.json | jq '{url, type, wordCount, processingTimeMs}'
```

**GET method (simpler for quick queries):**
```bash
curl -s "https://app.snap-render.com/v1/extract?url=https%3A%2F%2Fexample.com&type=markdown" -H "X-API-Key: $SNAPRENDER_API_KEY" | tee /tmp/extract_response.json | jq '{url, type, wordCount, processingTimeMs}'
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

Free at https://snap-render.com/auth/signup — 500 requests/month, no credit card.
