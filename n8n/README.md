# n8n-nodes-snaprender

[n8n](https://n8n.io) community node for [SnapRender Screenshot API](https://snap-render.com). Capture website screenshots as PNG, JPEG, WebP, or PDF directly in your n8n workflows.

## Install

In your n8n instance:

1. Go to **Settings** > **Community Nodes**
2. Enter `n8n-nodes-snaprender`
3. Click **Install**

## Credentials

1. Sign up at [app.snap-render.com](https://app.snap-render.com/auth/signup) — free, no credit card
2. Create an API key in your dashboard
3. In n8n, go to **Credentials** > **New** > **SnapRender API**
4. Paste your API key (starts with `sk_live_`)

## Operations

### Take Screenshot

Capture any website as PNG, JPEG, WebP, or PDF.

- **URL** — Website to capture
- **Format** — PNG, JPEG, WebP, or PDF
- **Full Page** — Capture entire scrollable page
- **Device** — iPhone 14, iPhone 15 Pro, Pixel 7, iPad Pro, MacBook Pro
- **Dark Mode** — Enable dark mode CSS emulation
- **Block Ads** — Remove advertisements
- **Block Cookie Banners** — Remove cookie consent popups
- **Output** — Binary (image file) or JSON (base64 data URI)
- **Additional Options** — Width, height, quality, delay, hide selectors, click selector

### Check Cache

Check if a screenshot is cached without capturing. Free, doesn't count against quota.

### Get Usage

Get current month's screenshot usage statistics.

## Example Workflow

1. **Trigger** (e.g., webhook, schedule, form)
2. **SnapRender** node — Take Screenshot with URL from trigger
3. **Send Email** / **Save to S3** / **Slack** — Use the binary output

## Free Tier

50 screenshots/month, no credit card required. Paid plans up to 10,000/month.

## Links

- [SnapRender Website](https://snap-render.com)
- [API Documentation](https://app.snap-render.com/docs)
- [GitHub](https://github.com/User0856/snaprender-integrations/tree/main/n8n)

## License

MIT
