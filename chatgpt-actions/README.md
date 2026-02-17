# SnapRender — ChatGPT Actions / OpenAI Function Calling

Use SnapRender with Custom GPTs or OpenAI function calling via the OpenAPI specification.

## Custom GPT Setup

1. Go to [ChatGPT](https://chat.openai.com) → Explore GPTs → Create
2. In the **Configure** tab, scroll to **Actions** → **Create new action**
3. Import the schema from URL: `https://app.snap-render.com/openapi.json`
4. Set **Authentication** → API Key → Header name: `X-API-Key`
5. Enter your SnapRender API key

The GPT can now take screenshots when asked.

## OpenAI Function Calling

The `openapi.json` in this directory defines all SnapRender endpoints. Use it with the OpenAI Assistants API or Chat Completions API with function calling.

## Auto-Discovery

SnapRender supports the standard ChatGPT Actions plugin discovery:

```
https://app.snap-render.com/.well-known/ai-plugin.json
```

## Get an API Key

Sign up free at [app.snap-render.com](https://app.snap-render.com/auth/signup) — 50 screenshots/month, no credit card required.

## Related

- [MCP Server](https://www.npmjs.com/package/snaprender-mcp) — For Claude Desktop & Claude Code
- [Node.js SDK](https://www.npmjs.com/package/snaprender) — `npm install snaprender`
- [Python SDK](https://pypi.org/project/snaprender/) — `pip install snaprender`
- [OpenClaw Skill](../openclaw/) — Screenshot skill for OpenClaw agents
