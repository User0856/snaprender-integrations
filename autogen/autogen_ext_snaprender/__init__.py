"""AutoGen tools for SnapRender Screenshot API.

Usage:
    from autogen_ext_snaprender import screenshot_tool, cache_tool, usage_tool

    agent = AssistantAgent("web_agent", tools=[screenshot_tool, cache_tool, usage_tool])
"""

from __future__ import annotations

import base64
import os
import tempfile
from typing import Optional

from autogen_core.tools import FunctionTool
from snaprender import SnapRender


def _client() -> SnapRender:
    key = os.environ.get("SNAPRENDER_API_KEY")
    if not key:
        raise RuntimeError(
            "SNAPRENDER_API_KEY environment variable is required. "
            "Get a free key at https://app.snap-render.com/auth/signup"
        )
    return SnapRender(api_key=key)


async def take_screenshot(
    url: str,
    format: str = "png",
    full_page: bool = False,
    dark_mode: bool = False,
    block_ads: bool = True,
    block_cookie_banners: bool = True,
    device: Optional[str] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
) -> str:
    """Take a screenshot of a website. Returns the saved file path and metadata.

    Args:
        url: URL to capture (must start with http:// or https://)
        format: Output format - png, jpeg, webp, or pdf (default: png)
        full_page: Capture entire scrollable page (default: False)
        dark_mode: Enable dark mode CSS emulation (default: False)
        block_ads: Block advertisements (default: True)
        block_cookie_banners: Remove cookie consent banners (default: True)
        device: Device preset - iphone_14, iphone_15_pro, pixel_7, ipad_pro, macbook_pro
        width: Viewport width in pixels, 320-3840
        height: Viewport height in pixels, 200-10000
    """
    snap = _client()
    try:
        result = snap.capture(
            url, format=format, full_page=full_page, dark_mode=dark_mode,
            block_ads=block_ads, block_cookie_banners=block_cookie_banners,
            device=device, width=width, height=height, response_type="json",
        )
    finally:
        snap.close()

    ext = format if format != "jpeg" else "jpg"
    fd, path = tempfile.mkstemp(suffix=f".{ext}", prefix="snaprender_")
    os.close(fd)

    image_data = result["image"]
    if "," in image_data:
        image_data = image_data.split(",", 1)[1]

    with open(path, "wb") as f:
        f.write(base64.b64decode(image_data))

    file_size = os.path.getsize(path)
    return (
        f"Screenshot saved to {path} ({file_size:,} bytes)\n"
        f"URL: {result.get('url', url)}\n"
        f"Format: {result.get('format', format)}\n"
        f"Cache: {result.get('cache', 'unknown')}\n"
        f"Response time: {result.get('responseTime', 'unknown')}\n"
        f"Remaining credits: {result.get('remainingCredits', 'unknown')}"
    )


async def check_cache(url: str, format: str = "png") -> str:
    """Check if a screenshot is already cached without capturing. Does not count against quota.

    Args:
        url: URL to check
        format: Output format - png, jpeg, webp, or pdf (default: png)
    """
    snap = _client()
    try:
        info = snap.info(url, format=format)
    finally:
        snap.close()

    if info["cached"]:
        return (
            f"Cached: YES\nURL: {info['url']}\n"
            f"Cached at: {info.get('cached_at', 'unknown')}\n"
            f"Expires at: {info.get('expires_at', 'unknown')}"
        )
    return f"Cached: NO\nURL: {info['url']}"


async def get_usage() -> str:
    """Get current month's screenshot usage statistics including plan, used, limit, and remaining credits."""
    snap = _client()
    try:
        usage = snap.usage()
    finally:
        snap.close()

    return (
        f"Plan: {usage['plan']}\n"
        f"Used: {usage['used']}\nLimit: {usage['limit']}\n"
        f"Remaining: {usage['remaining']}\nPeriod: {usage['period']}"
    )


screenshot_tool = FunctionTool(take_screenshot, description="Capture a screenshot of any website as PNG, JPEG, WebP, or PDF")
cache_tool = FunctionTool(check_cache, description="Check if a screenshot is cached without capturing")
usage_tool = FunctionTool(get_usage, description="Get current month's screenshot usage statistics")

__all__ = ["screenshot_tool", "cache_tool", "usage_tool", "take_screenshot", "check_cache", "get_usage"]
