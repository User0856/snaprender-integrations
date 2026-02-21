# SnapRender LangChain Tool

LangChain / LangGraph tool for [SnapRender Screenshot API](https://snap-render.com). Lets your LangChain agents capture website screenshots.

## Install

```bash
pip install snaprender langchain-core
```

## Setup

```bash
export SNAPRENDER_API_KEY="sk_live_your_key_here"
```

Get a free key at [app.snap-render.com](https://app.snap-render.com/auth/signup) — 50 screenshots/month, no credit card.

## Usage

```python
from snaprender_langchain import take_screenshot, check_cache, get_usage

# Use as standalone tools
result = take_screenshot.invoke({"url": "https://example.com"})
print(result)

# Or bind to a LangChain agent
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

llm = ChatOpenAI(model="gpt-4o")
tools = [take_screenshot, check_cache, get_usage]
agent = create_react_agent(llm, tools)

response = agent.invoke({"messages": [("user", "Take a screenshot of stripe.com")]})
```

## Tools

### `take_screenshot`

Capture any website as PNG, JPEG, WebP, or PDF.

Parameters: `url`, `format`, `full_page`, `dark_mode`, `block_ads`, `block_cookie_banners`, `device`, `width`, `height`

### `check_cache`

Check if a screenshot is cached (free, doesn't count against quota).

Parameters: `url`, `format`

### `get_usage`

Get current month's usage stats.

## License

MIT
