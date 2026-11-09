# SnapRender piece for Activepieces

[SnapRender](https://snap-render.com) is a screenshot API. It opens pages in a real Chrome browser and returns PNG, JPEG, WebP or PDF files, renders your own HTML or Markdown, and extracts page content as Markdown, text or metadata.

This package is the SnapRender piece for self-hosted Activepieces (Community Edition and Enterprise), version 0.88.2 or newer.

## Install on a self-hosted Activepieces

1. Sign in as the platform admin and open **Platform Admin**, then **Pieces**.
2. Click **Install Piece** and keep **Package Type** on **NPM Registry**.
3. Enter the **Piece Name** `activepieces-piece-snaprender` and the **Piece Version** `0.1.0`, then click **Install**.
4. In the flow builder, add a step and search for **SnapRender**.

Your Activepieces server must be able to reach `registry.npmjs.org`, because it downloads the package from npm when you install it. Each flow step is pinned to the piece version it was added with; to move to a newer release, install the new version and pick it from the version menu next to the step name.

You can also install it with the API, using a platform admin token or API key:

```bash
curl -X POST https://your-activepieces-host/api/v1/pieces \
  -H "Authorization: Bearer $AP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"packageType":"REGISTRY","scope":"PLATFORM","pieceName":"activepieces-piece-snaprender","pieceVersion":"0.1.0"}'
```

## Connect your account

1. Create a free account at https://app.snap-render.com/auth/signup (200 captures a month, no credit card).
2. Copy your API key from the dashboard, or create one at https://app.snap-render.com/dashboard/keys
3. In Activepieces, create a SnapRender connection and paste the key. The key is checked against your account, which uses no captures.

## Actions

- **Take Screenshot**: capture a page as PNG, JPEG or WebP, on desktop or as a phone or tablet. Ads and cookie banners are removed by default.
- **Create PDF**: save a page as a single-page PDF that shows the page as it looks in the browser.
- **Render HTML or Markdown**: turn your own HTML or Markdown into an image or PDF (social cards, certificates, reports).
- **Extract Content**: get a page as Markdown, plain text, HTML, the main article, its links or its metadata.
- **Batch Screenshots**: capture up to 50 pages in one job and get a download link for each.
- **Get Batch Status**: check a batch and get the download links of finished captures.
- **Create Screenshot Link**: create a signed, expiring link that shows a fresh screenshot when opened.
- **Check Stored Copy**: check whether a recent copy of a screenshot is stored.
- **Get Usage**: get your plan and the captures used and left this month.
- **Custom API Call**: call any other SnapRender endpoint with your key added. It only sends the key to `https://app.snap-render.com`.

Screenshots and PDFs are returned as Activepieces files, so the next step (Google Drive, Slack, email, S3) can use them directly. Failed captures do not count against your plan, and errors show the API's reason, for example `TARGET_UNREACHABLE: The target website could not be reached`.

## Links

- [All SnapRender integrations](https://snap-render.com/integrations)
- [API documentation](https://snap-render.com/docs)
- [OpenAPI spec](https://app.snap-render.com/openapi.json)
- [Report an issue](https://github.com/User0856/snaprender-integrations/issues)

## Source

The `piece/` folder holds the piece source, tests included. It builds inside the [Activepieces repository](https://github.com/activepieces/activepieces): copy it to `packages/pieces/community/snaprender`, then run `npm run build-piece snaprender` from the repository root. The published npm package is that build with the package name changed to `activepieces-piece-snaprender`.

npm: [activepieces-piece-snaprender](https://www.npmjs.com/package/activepieces-piece-snaprender)

## License

MIT
