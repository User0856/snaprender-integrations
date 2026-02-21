# langchain-snaprender

[![npm](https://img.shields.io/npm/v/langchain-snaprender)](https://www.npmjs.com/package/langchain-snaprender)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

LangChain.js tools for [SnapRender Screenshot API](https://snap-render.com). Lets your LangChain agents capture website screenshots as PNG, JPEG, WebP, or PDF.

## Install

```bash
npm install langchain-snaprender @langchain/core
```

## Setup

```bash
export SNAPRENDER_API_KEY="sk_live_your_key_here"
```

Get a free key at [app.snap-render.com](https://app.snap-render.com/auth/signup) — 50 screenshots/month, no credit card.

## Usage

```typescript
import { SnapRenderScreenshot, SnapRenderCacheCheck, SnapRenderUsage } from "langchain-snaprender";

// Pass API key explicitly or use SNAPRENDER_API_KEY env var
const screenshotTool = new SnapRenderScreenshot();
const cacheTool = new SnapRenderCacheCheck();
const usageTool = new SnapRenderUsage();

// Use standalone
const result = await screenshotTool.invoke({ url: "https://example.com" });
console.log(result);

// Or bind to a LangChain agent
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

const llm = new ChatOpenAI({ model: "gpt-4o" });
const tools = [screenshotTool, cacheTool, usageTool];
const agent = createReactAgent({ llm, tools });

const response = await agent.invoke({
  messages: [{ role: "user", content: "Take a screenshot of stripe.com" }],
});
```

## Tools

### `SnapRenderScreenshot` (name: `take_screenshot`)

Capture any website as PNG, JPEG, WebP, or PDF.

Parameters: `url`, `format`, `full_page`, `dark_mode`, `block_ads`, `block_cookie_banners`, `device`, `width`, `height`

### `SnapRenderCacheCheck` (name: `check_screenshot_cache`)

Check if a screenshot is cached (free, doesn't count against quota).

Parameters: `url`, `format`

### `SnapRenderUsage` (name: `get_screenshot_usage`)

Get current month's usage stats.

## License

MIT
