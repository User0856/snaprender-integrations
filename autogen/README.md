# autogen-ext-snaprender

[![PyPI](https://img.shields.io/pypi/v/autogen-ext-snaprender)](https://pypi.org/project/autogen-ext-snaprender/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

AutoGen tools for [SnapRender Screenshot API](https://snap-render.com). Lets your AutoGen agents capture website screenshots as PNG, JPEG, WebP, or PDF.

## Install

```bash
pip install autogen-ext-snaprender
```

## Setup

```bash
export SNAPRENDER_API_KEY="sk_live_your_key_here"
```

Get a free key at [app.snap-render.com](https://app.snap-render.com/auth/signup) — 50 screenshots/month, no credit card.

## Usage

```python
from autogen_ext_snaprender import screenshot_tool, cache_tool, usage_tool

# Use with AssistantAgent
from autogen_agentchat.agents import AssistantAgent

agent = AssistantAgent(
    "web_agent",
    model_client=model_client,
    tools=[screenshot_tool, cache_tool, usage_tool],
)
```

## Tools

### `screenshot_tool`

Capture any website as PNG, JPEG, WebP, or PDF with device emulation, dark mode, ad blocking, and more.

### `cache_tool`

Check if a screenshot is cached (free, doesn't count against quota).

### `usage_tool`

Get current month's usage stats.

## License

MIT
