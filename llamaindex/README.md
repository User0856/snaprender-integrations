# llama-index-tools-snaprender

[LlamaIndex](https://www.llamaindex.ai) tools for [SnapRender](https://snap-render.com). Your agent can take screenshots of web pages and read rendered pages as markdown. Pages load in a real Chrome browser with ads and cookie banners removed, and the screenshot goes back to the model as an image block it can look at.

- `take_screenshot`: capture a URL or raw HTML (desktop, phone or tablet, viewport or full page). Returns a text summary plus an `ImageBlock`.
- `extract_content`: read a page after JavaScript runs, as markdown, main article text, plain text, links or metadata.

Both tools have async versions, used automatically by async agents.

The free plan includes 200 captures a month. Get a key at [app.snap-render.com/auth/signup](https://app.snap-render.com/auth/signup), or start with no key at all (see below).

## Install

```bash
pip install llama-index-tools-snaprender
export SNAPRENDER_API_KEY=sk_live_...
```

## Try it with no key

If no key is set, the tools start a free agent trial key on the first call: 100 captures over 7 days (up to 30 a day), with a small watermark and lower priority. The key is saved in `~/.snaprender/trial.json` and shared with the other SnapRender tools on the machine (the MCP server and the AI SDK tools), so one trial covers all of them.

While the trial key is in use, each tool result ends with a short note for your human:

```
Trial key: 97 captures left. Ask your human to claim it at https://app.snap-render.com/dashboard/claim/... to remove the watermark and get 200 free captures a month.
```

Claiming takes a free account. The same key then keeps working with no watermark, so nothing in your code changes. Pass `trial=False` to turn this off and get a `MISSING_API_KEY` error instead. Details: [snap-render.com/docs/agent-trial](https://snap-render.com/docs/agent-trial).

## Usage

```python
import asyncio

from llama_index.core.agent.workflow import FunctionAgent
from llama_index.llms.anthropic import Anthropic
from llama_index.tools.snaprender import SnapRenderToolSpec

agent = FunctionAgent(
    tools=SnapRenderToolSpec().to_tool_list(),
    llm=Anthropic(model="claude-sonnet-5-5"),
    system_prompt="You can look at web pages with take_screenshot and read them with extract_content.",
)


async def main() -> None:
    response = await agent.run(
        "Take a screenshot of https://www.llamaindex.ai on an iPhone (device iphone_14) "
        "and tell me what the first screen shows."
    )
    print(response)


asyncio.run(main())
```

Use any LLM integration that accepts images in tool results. Note (Nov 2026): `llama-index-llms-anthropic` 0.12.3 fails with the `anthropic` SDK 2.x (`'typing.Union' object is not callable`) before any tool runs; `pip install "anthropic<2"` works until a fix ships.

Call the tools directly too:

```python
spec = SnapRenderToolSpec()
blocks = spec.take_screenshot(url="https://example.com", full_page=True)  # [TextBlock, ImageBlock]
markdown = spec.extract_content(url="https://example.com", type="article")
```

## Tool inputs

`take_screenshot` (pass `url` or `html`): `format` (`jpeg` default at quality 80, `png`, `webp`), `full_page`, `lazy_load`, `device` (`iphone_14`, `iphone_15_pro`, `pixel_7`, `ipad_pro`, `macbook_pro`), `width` and `height` (CSS px, default 1280x800), `dark_mode`, `delay` (ms), `quality`, `hide_selectors`, `click_selector`, `block_ads` and `block_cookie_banners` (both default true), `cache` (accept a copy from the last 24 hours, free; default false).

`extract_content`: `url`, `type` (`markdown` default, `article`, `text`, `html`, `links`, `metadata`), `selector`, `max_length` (default 100000), `delay`, `block_ads`, `block_cookie_banners`, `cache`.

Captures render at 2x device scale, so a 1280 px viewport gives a 2560 px wide image. When an image is over `max_image_bytes` (default 5 MB) or `max_image_dimension` (default 8000 px), the tool returns only the text summary and tells the model to retry with `full_page=False` or a smaller viewport.

## Options

```python
SnapRenderToolSpec(
    api_key=None,                # default: SNAPRENDER_API_KEY
    base_url="https://app.snap-render.com",
    timeout=90.0,                # seconds
    max_retries=1,               # after a per-minute rate limit, waits Retry-After (up to 60 s)
    max_image_bytes=5_000_000,
    max_image_dimension=8000,
    get_api_key=None,            # callable returning a key at call time
    trial=True,                  # with no key, use the shared agent trial key
    trial_agent=None,            # name shown on the claim page, default "llama-index-tools-snaprender"
)
```

## Errors

Failed requests raise `SnapRenderError` with `status`, `code` and the API's message, for example `SnapRender 422 TARGET_UNREACHABLE: The target website could not be reached...`. Agents pass the message to the model so it can explain or try another URL. Failed renders do not use a capture. Monthly quota errors are never retried.

Trial keys have their own codes, and their messages already include the claim link: `TRIAL_LIMIT_REACHED` (429, the daily or total trial captures are used), `TRIAL_EXPIRED` (401, claim the key and it works again), `TRIAL_BUSY` (503, the trial lane is busy, try again in a minute) and, when a new trial key cannot be started, `AGENT_TRIAL_LIMIT` (429) or `AGENT_TRIAL_UNAVAILABLE` (503).

The tools cannot reach localhost, private networks or pages behind a login. If a capture of your own site shows a security check page, see [snap-render.com/docs/allow-snaprender](https://snap-render.com/docs/allow-snaprender).

## Development

```bash
pip install -e ".[test]"
pytest                                        # unit tests, no network
SNAPRENDER_TEST_KEY=sk_live_... pytest tests/test_live.py   # live API tests
SNAPRENDER_LIVE_TRIAL=1 pytest tests/test_trial_live.py     # starts ONE real trial key and makes one capture
```

## Links

- API docs: [snap-render.com/docs](https://snap-render.com/docs)
- Agent trial: [snap-render.com/docs/agent-trial](https://snap-render.com/docs/agent-trial)
- MCP server (Claude, Cursor and other MCP clients): [snaprender-mcp](https://www.npmjs.com/package/snaprender-mcp)
- Support: support@snap-render.com

MIT License
