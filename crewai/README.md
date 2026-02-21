# SnapRender CrewAI Tool

[CrewAI](https://crewai.com) tool for [SnapRender Screenshot API](https://snap-render.com). Lets your CrewAI agents capture website screenshots.

## Install

```bash
pip install snaprender crewai
```

## Setup

```bash
export SNAPRENDER_API_KEY="sk_live_your_key_here"
```

Get a free key at [app.snap-render.com](https://app.snap-render.com/auth/signup) — 50 screenshots/month, no credit card.

## Usage

```python
from crewai import Agent, Task, Crew
from snaprender_crewai import SnapRenderScreenshotTool, SnapRenderCacheTool, SnapRenderUsageTool

researcher = Agent(
    role="Web Researcher",
    goal="Capture and analyze website screenshots",
    backstory="You are a visual web analyst.",
    tools=[SnapRenderScreenshotTool(), SnapRenderCacheTool(), SnapRenderUsageTool()],
)

task = Task(
    description="Take a screenshot of stripe.com in dark mode on iPhone",
    expected_output="Screenshot file path and metadata",
    agent=researcher,
)

crew = Crew(agents=[researcher], tasks=[task])
result = crew.kickoff()
```

## Tools

### `SnapRenderScreenshotTool`

Capture any website as PNG, JPEG, WebP, or PDF with device emulation, dark mode, ad blocking, and more.

### `SnapRenderCacheTool`

Check if a screenshot is cached (free, doesn't count against quota).

### `SnapRenderUsageTool`

Get current month's usage stats.

## License

MIT
