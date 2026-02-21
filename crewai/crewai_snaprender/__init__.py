"""CrewAI tools for SnapRender Screenshot API.

Usage:
    from crewai_snaprender import SnapRenderScreenshotTool, SnapRenderCacheTool, SnapRenderUsageTool

    agent = Agent(
        role="Web Researcher",
        tools=[SnapRenderScreenshotTool(), SnapRenderCacheTool(), SnapRenderUsageTool()],
    )
"""

from __future__ import annotations

import base64
import os
import tempfile
from typing import Optional, Type

from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from snaprender import SnapRender


def _client() -> SnapRender:
    key = os.environ.get("SNAPRENDER_API_KEY")
    if not key:
        raise RuntimeError(
            "SNAPRENDER_API_KEY environment variable is required. "
            "Get a free key at https://app.snap-render.com/auth/signup"
        )
    return SnapRender(api_key=key)


class ScreenshotInput(BaseModel):
    url: str = Field(description="URL to capture (must start with http:// or https://)")
    format: str = Field(default="png", description="Output format: png, jpeg, webp, or pdf")
    full_page: bool = Field(default=False, description="Capture entire scrollable page")
    dark_mode: bool = Field(default=False, description="Enable dark mode CSS emulation")
    block_ads: bool = Field(default=True, description="Block advertisements")
    block_cookie_banners: bool = Field(default=True, description="Remove cookie consent banners")
    device: Optional[str] = Field(default=None, description="Device preset: iphone_14, iphone_15_pro, pixel_7, ipad_pro, macbook_pro")
    width: Optional[int] = Field(default=None, description="Viewport width 320-3840")
    height: Optional[int] = Field(default=None, description="Viewport height 200-10000")


class CacheInput(BaseModel):
    url: str = Field(description="URL to check")
    format: str = Field(default="png", description="Output format: png, jpeg, webp, or pdf")


class SnapRenderScreenshotTool(BaseTool):
    name: str = "take_screenshot"
    description: str = (
        "Take a screenshot of a website. Returns the saved file path and metadata. "
        "Supports device emulation, dark mode, ad blocking, cookie banner removal, and full-page capture."
    )
    args_schema: Type[BaseModel] = ScreenshotInput

    def _run(self, url: str, format: str = "png", full_page: bool = False,
             dark_mode: bool = False, block_ads: bool = True,
             block_cookie_banners: bool = True, device: Optional[str] = None,
             width: Optional[int] = None, height: Optional[int] = None) -> str:
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


class SnapRenderCacheTool(BaseTool):
    name: str = "check_screenshot_cache"
    description: str = "Check if a screenshot is already cached without capturing. Does not count against quota."
    args_schema: Type[BaseModel] = CacheInput

    def _run(self, url: str, format: str = "png") -> str:
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


class SnapRenderUsageTool(BaseTool):
    name: str = "get_usage"
    description: str = "Get current month's screenshot usage statistics."

    def _run(self) -> str:
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


__all__ = ["SnapRenderScreenshotTool", "SnapRenderCacheTool", "SnapRenderUsageTool"]
