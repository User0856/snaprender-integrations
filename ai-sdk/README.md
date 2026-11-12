# snaprender-ai-sdk

[Vercel AI SDK](https://ai-sdk.dev) tools for [SnapRender](https://snap-render.com). Your agent can take screenshots of web pages and read rendered pages as markdown. Pages load in a real Chrome browser with ads and cookie banners removed, and the screenshot goes back to the model as an image it can look at.

- `takeScreenshot`: capture a URL or raw HTML (desktop, phone or tablet, viewport or full page) and send the image to the model.
- `extractContent`: read a page after JavaScript runs, as markdown, main article text, plain text, links or metadata.

The free plan includes 200 captures a month. Get a key at [app.snap-render.com/auth/signup](https://app.snap-render.com/auth/signup), or start with no key at all (see below).

## Install

```bash
npm install snaprender-ai-sdk ai zod
```

Requires AI SDK 7 (`ai@^7`) and Node.js 20.3 or newer. Set your key:

```bash
export SNAPRENDER_API_KEY=sk_live_...
```

## Try it with no key

If no key is set, the tools start a free agent trial key on the first call: 100 captures over 7 days (up to 30 a day), with a small watermark and lower priority. The key is saved in `~/.snaprender/trial.json` and shared with the other SnapRender tools on the machine (the MCP server and the LlamaIndex tools), so one trial covers all of them.

While the trial key is in use, each tool result ends with a short note for your human:

```
Trial key: 97 captures left. Ask your human to claim it at https://app.snap-render.com/dashboard/claim/... to remove the watermark and get 200 free captures a month.
```

Claiming takes a free account. The same key then keeps working with no watermark, so nothing in your code changes. Pass `trial: false` to turn this off and get a `MISSING_API_KEY` error instead. Details: [snap-render.com/docs/agent-trial](https://snap-render.com/docs/agent-trial).

## Quick start

```ts
import { generateText, isStepCount } from 'ai';
import { snaprenderTools } from 'snaprender-ai-sdk';

const { text } = await generateText({
  model: 'anthropic/claude-sonnet-5.5',
  prompt: 'Take a screenshot of https://vercel.com on an iPhone and tell me what the hero section says.',
  tools: snaprenderTools(),
  stopWhen: isStepCount(4),
});

console.log(text);
```

Pick single tools if you only need one:

```ts
import { takeScreenshot, extractContent } from 'snaprender-ai-sdk';

const tools = {
  takeScreenshot: takeScreenshot(),
  extractContent: extractContent({ timeoutMs: 30_000 }),
};
```

The tools work the same way with `streamText`, `ToolLoopAgent` and any provider that accepts images in tool results (Anthropic, OpenAI, Google and others).

## What the model sees

`takeScreenshot` returns the image through the tool's `toModelOutput`, as a text summary plus an image file part:

```ts
{
  type: 'content',
  value: [
    { type: 'text', text: 'Screenshot of https://example.com (2560x1600 px, 161337 bytes, cache MISS, 172 captures left this period).' },
    { type: 'file', mediaType: 'image/jpeg', data: { type: 'data', data: '<base64>' } },
  ],
}
```

The tool's own result (what you get in `steps[].toolResults` and in UI messages) is a JSON object with `source`, `mediaType`, `bytes`, `width`, `height`, `cache`, `remainingCredits` and `image` (base64). On a trial key it also has `trialNote`, which is added to the text the model sees.

Captures render at 2x device scale, so a 1280 px wide viewport gives a 2560 px wide image. Very tall full-page captures can be larger than vision models accept. When an image is over `maxImageBytes` (default 5 MB) or `maxImageDimension` (default 8000 px), the tool leaves the image out and tells the model why, so it can try again with `full_page: false` or a smaller viewport.

`extractContent` returns the page content as text, followed by a short source line.

## Tool inputs

`takeScreenshot` (pass `url` or `html`):

| Input | Type | Notes |
|---|---|---|
| `url` | string | Public http or https URL |
| `html` | string | Raw HTML to render instead of a URL (max 2 MB) |
| `format` | `jpeg` \| `png` \| `webp` | Default `jpeg` at quality 80 (smallest for the model) |
| `full_page` | boolean | Whole scrollable page |
| `lazy_load` | boolean | With `full_page`, scroll first so lazy images load |
| `device` | `iphone_14` \| `iphone_15_pro` \| `pixel_7` \| `ipad_pro` \| `macbook_pro` | Omit for desktop |
| `width`, `height` | number | Viewport in CSS px (320-3840, 200-10000). Default 1280x800 |
| `dark_mode` | boolean | `prefers-color-scheme: dark` |
| `delay` | number | Extra wait after load, ms (0-10000) |
| `quality` | number | JPEG or WebP quality (1-100) |
| `hide_selectors` | string | Comma-separated CSS selectors to hide |
| `click_selector` | string | CSS selector to click before capture |
| `block_ads`, `block_cookie_banners` | boolean | Both default `true` |
| `cache` | boolean | Accept a copy from the last 24 hours (free). Default `false` |

`extractContent`:

| Input | Type | Notes |
|---|---|---|
| `url` | string | Public http or https URL |
| `type` | `markdown` \| `article` \| `text` \| `html` \| `links` \| `metadata` | Default `markdown` |
| `selector` | string | Read only part of the page, e.g. `main` |
| `max_length` | number | Max characters (default 100000) |
| `delay` | number | Extra wait after load, ms |
| `block_ads`, `block_cookie_banners`, `cache` | boolean | As above |

## Options

Every factory (`takeScreenshot`, `extractContent`, `snaprenderTools`) takes the same options:

| Option | Default | Notes |
|---|---|---|
| `apiKey` | `process.env.SNAPRENDER_API_KEY` | Your SnapRender key |
| `getApiKey` | none | Async function that returns a key at call time (secret stores) |
| `trial` | `true` | With no key, use the shared agent trial key. `false` throws `MISSING_API_KEY` instead |
| `trialAgent` | `snaprender-ai-sdk` | Name sent when starting a trial key, shown on the claim page |
| `baseUrl` | `https://app.snap-render.com` | |
| `timeoutMs` | `90000` | Per request |
| `maxRetries` | `1` | Retries after a per-minute rate limit, waiting as long as `Retry-After` says (up to 60 s). Monthly quota errors are never retried |
| `maxImageBytes` | `5000000` | `takeScreenshot` only |
| `maxImageDimension` | `8000` | `takeScreenshot` only |
| `fetch` | global `fetch` | Custom fetch (proxies, tests) |

## Errors

Failed requests throw `SnapRenderError` with `status`, `code` and the API's message, for example `SnapRender 422 TARGET_UNREACHABLE: The target website could not be reached...`. The AI SDK passes the message to the model as a tool error, so the agent can explain or try another URL. Failed renders do not use a capture.

Trial keys have their own codes, and their messages already include the claim link: `TRIAL_LIMIT_REACHED` (429, the daily or total trial captures are used), `TRIAL_EXPIRED` (401, claim the key and it works again), `TRIAL_BUSY` (503, the trial lane is busy, try again in a minute) and, when a new trial key cannot be started, `AGENT_TRIAL_LIMIT` (429) or `AGENT_TRIAL_UNAVAILABLE` (503).

The tools cannot reach localhost, private networks or pages behind a login. If a capture of your own site shows a security check page, see [snap-render.com/docs/allow-snaprender](https://snap-render.com/docs/allow-snaprender).

## Example

```bash
git clone https://github.com/User0856/snaprender-integrations
cd snaprender-integrations/ai-sdk
npm install && npm run build
SNAPRENDER_API_KEY=sk_live_... ANTHROPIC_API_KEY=sk-ant-... npm run example -- https://example.com
```

`examples/basic.ts` uses Anthropic or OpenAI directly when their keys are set, and the AI Gateway otherwise.

## Development

```bash
npm test                                   # unit tests, no network
SNAPRENDER_TEST_KEY=sk_live_... npm run test:live   # live API tests (about 14 captures)
npm run test:live:trial                    # starts ONE real trial key and makes one capture
npm run typecheck
```

## Links

- API docs: [snap-render.com/docs](https://snap-render.com/docs)
- Pricing: [snap-render.com/pricing](https://snap-render.com/pricing)
- Agent trial: [snap-render.com/docs/agent-trial](https://snap-render.com/docs/agent-trial)
- MCP server (Claude, Cursor and other MCP clients): [snaprender-mcp](https://www.npmjs.com/package/snaprender-mcp)
- Support: support@snap-render.com

MIT License
