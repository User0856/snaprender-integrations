"""Run: pip install llama-index-tools-snaprender llama-index-llms-anthropic
SNAPRENDER_API_KEY=... ANTHROPIC_API_KEY=... python examples/agent.py [url]"""

import asyncio
import sys

from llama_index.core.agent.workflow import FunctionAgent, ToolCall
from llama_index.llms.anthropic import Anthropic

from llama_index.tools.snaprender import SnapRenderToolSpec

URL = sys.argv[1] if len(sys.argv) > 1 else "https://snap-render.com"

agent = FunctionAgent(
    tools=SnapRenderToolSpec().to_tool_list(),
    llm=Anthropic(model="claude-sonnet-5-5", max_tokens=1024),
    system_prompt="You can look at web pages with take_screenshot and read them with extract_content.",
)


async def main() -> None:
    handler = agent.run(
        f"Take a screenshot of {URL} on an iPhone (device iphone_14) and read the page as markdown. "
        "Then give three short bullet points on what the page offers and one thing about the mobile layout "
        "you can see in the screenshot."
    )
    async for event in handler.stream_events():
        if isinstance(event, ToolCall):
            print(f"tool call: {event.tool_name} {event.tool_kwargs}", file=sys.stderr)
    print(await handler)


asyncio.run(main())
