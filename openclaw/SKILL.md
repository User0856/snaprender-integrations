---
name: snaprender
description: Capture screenshots of any website for visual analysis
metadata: {"openclaw": {"requires": {"bins": ["curl"], "env": ["SNAPRENDER_API_KEY"]}}}
---

# SnapRender — Website Screenshot Tool

When the user asks you to screenshot, capture, or visually inspect a website,
use the SnapRender API to take a screenshot.

## API Call

Use bash with curl:

curl -s "https://app.snap-render.com/v1/screenshot?url=URL&response_type=json&block_ads=true&block_cookie_banners=true" \
  -H "X-API-Key: $SNAPRENDER_API_KEY"

## Optional Parameters

Add these as query parameters:
- device=iphone_15_pro (or: iphone_14, pixel_7, ipad_pro, macbook_pro)
- dark_mode=true
- full_page=true
- format=png (or: jpeg, webp, pdf)

## Response

JSON with an `image` field containing a base64 data URI (data:image/png;base64,...).
Pass this image to your vision capabilities to analyze the screenshot.

## Examples

- "Screenshot example.com" → call API with just the URL
- "Screenshot stripe.com on iPhone" → add device=iphone_15_pro
- "Dark mode screenshot of github.com" → add dark_mode=true
