"""SnapRender tool spec: website screenshots and rendered page content for LlamaIndex agents."""


import asyncio
import os
import struct
import time
from typing import Any, Callable, Dict, List, Literal, Optional, Tuple, Union

import httpx
from llama_index.core.base.llms.types import ImageBlock, TextBlock
from llama_index.core.tools.tool_spec.base import BaseToolSpec

__version__ = "0.1.0"

DEFAULT_BASE_URL = "https://app.snap-render.com"
SIGNUP_URL = "https://app.snap-render.com/auth/signup"

Device = Literal["iphone_14", "iphone_15_pro", "pixel_7", "ipad_pro", "macbook_pro"]
ImageFormat = Literal["jpeg", "png", "webp"]
ExtractType = Literal["markdown", "text", "html", "article", "links", "metadata"]


class SnapRenderError(Exception):
    """A failed SnapRender request, with the API's status, code and message."""

    def __init__(self, status: int, code: str, message: str, retry_after: Optional[float] = None):
        super().__init__(f"SnapRender {status} {code}: {message}")
        self.status = status
        self.code = code
        self.message = message
        self.retry_after = retry_after


def image_size(data: bytes) -> Optional[Tuple[int, int]]:
    """Read (width, height) from PNG, JPEG or WebP bytes without decoding the image."""
    if len(data) >= 24 and data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    if len(data) >= 4 and data[:2] == b"\xff\xd8":
        i = 2
        while i + 9 < len(data):
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                i += 2
                continue
            length = struct.unpack(">H", data[i + 2 : i + 4])[0]
            if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                h, w = struct.unpack(">HH", data[i + 5 : i + 9])
                return w, h
            i += 2 + length
        return None
    if len(data) >= 30 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        chunk = data[12:16]
        if chunk == b"VP8X":
            w = 1 + int.from_bytes(data[24:27], "little")
            h = 1 + int.from_bytes(data[27:30], "little")
            return w, h
        if chunk == b"VP8L":
            b = int.from_bytes(data[21:25], "little")
            return (b & 0x3FFF) + 1, ((b >> 14) & 0x3FFF) + 1
        if chunk == b"VP8 ":
            w = int.from_bytes(data[26:28], "little") & 0x3FFF
            h = int.from_bytes(data[28:30], "little") & 0x3FFF
            return w, h
    return None


def _compact(params: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in params.items() if v is not None}


def _error_from(response: httpx.Response) -> SnapRenderError:
    code = f"HTTP_{response.status_code}"
    message = response.reason_phrase or "Request failed."
    try:
        err = response.json().get("error") or {}
        code = err.get("code") or code
        message = err.get("message") or message
    except Exception:
        pass
    retry_after: Optional[float] = None
    try:
        retry_after = float(response.headers.get("Retry-After", ""))
    except ValueError:
        pass
    return SnapRenderError(response.status_code, code, message, retry_after)


class SnapRenderToolSpec(BaseToolSpec):
    """SnapRender tools: take website screenshots the model can see, and read rendered pages.

    Pages load in a real Chrome browser with ads and cookie banners removed.
    The free plan includes 200 captures a month: https://app.snap-render.com/auth/signup
    """

    spec_functions = [
        ("take_screenshot", "atake_screenshot"),
        ("extract_content", "aextract_content"),
    ]

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 90.0,
        max_retries: int = 1,
        max_image_bytes: int = 5_000_000,
        max_image_dimension: int = 8000,
        get_api_key: Optional[Callable[[], str]] = None,
    ) -> None:
        """Create the tool spec.

        Args:
            api_key: SnapRender API key. Defaults to the SNAPRENDER_API_KEY environment variable.
            base_url: API base URL.
            timeout: Request timeout in seconds (full-page captures can be slow).
            max_retries: Retries after a per-minute rate limit (HTTP 429 RATE_LIMITED), waiting as
                long as Retry-After says (up to 60 s). Monthly quota errors are never retried.
            max_image_bytes: Largest image sent to the model; bigger captures return a text note.
            max_image_dimension: Largest width or height in pixels sent to the model.
            get_api_key: Optional callable that returns a key at call time (secret stores).
        """
        self._api_key = api_key
        self._get_api_key = get_api_key
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._max_retries = max_retries
        self._max_image_bytes = max_image_bytes
        self._max_image_dimension = max_image_dimension

    # -- key and HTTP ---------------------------------------------------------------

    def _key(self) -> str:
        key = self._api_key or (self._get_api_key() if self._get_api_key else None)
        key = key or os.environ.get("SNAPRENDER_API_KEY")
        if key:
            return key
        # TODO(agent-trial): when the keyless agent trial key ships (POST /v1/agent-trial,
        # returns an sk_trial_ key), mint and cache one here instead of raising.
        raise SnapRenderError(
            401,
            "MISSING_API_KEY",
            "No API key. Set SNAPRENDER_API_KEY or pass api_key. "
            f"Get a free key (200 captures a month) at {SIGNUP_URL}",
        )

    def _headers(self) -> Dict[str, str]:
        return {
            "X-API-Key": self._key(),
            "Content-Type": "application/json",
            "User-Agent": f"llama-index-tools-snaprender/{__version__}",
        }

    def _retry_wait(self, error: SnapRenderError, attempt: int) -> Optional[float]:
        if error.code != "RATE_LIMITED" or attempt >= self._max_retries:
            return None
        wait = error.retry_after or 5.0
        return wait if wait <= 60 else None

    def _post(self, path: str, body: Dict[str, Any]) -> httpx.Response:
        attempt = 0
        while True:
            with httpx.Client(timeout=self._timeout) as client:
                response = client.post(f"{self._base_url}{path}", json=body, headers=self._headers())
            if response.is_success:
                return response
            error = _error_from(response)
            wait = self._retry_wait(error, attempt)
            if wait is None:
                raise error
            attempt += 1
            time.sleep(wait)

    async def _apost(self, path: str, body: Dict[str, Any]) -> httpx.Response:
        attempt = 0
        while True:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(f"{self._base_url}{path}", json=body, headers=self._headers())
            if response.is_success:
                return response
            error = _error_from(response)
            wait = self._retry_wait(error, attempt)
            if wait is None:
                raise error
            attempt += 1
            await asyncio.sleep(wait)

    # -- result shaping -------------------------------------------------------------

    def _screenshot_body(self, **params: Any) -> Dict[str, Any]:
        url, html = params.get("url"), params.get("html")
        if bool(url) == bool(html):
            raise ValueError("Pass exactly one of url or html.")
        fmt = params.get("format") or "jpeg"
        params["format"] = fmt
        if params.get("quality") is None and fmt != "png":
            params["quality"] = 80
        params["response_type"] = "binary"
        return _compact(params)

    def _screenshot_blocks(self, source: str, response: httpx.Response) -> List[Union[TextBlock, ImageBlock]]:
        data = response.content
        media_type = response.headers.get("Content-Type", "image/jpeg").split(";")[0]
        size = image_size(data)
        remaining = response.headers.get("X-Remaining-Credits")
        summary = f"Screenshot of {source} ("
        if size:
            summary += f"{size[0]}x{size[1]} px, "
        summary += f"{len(data)} bytes, cache {response.headers.get('X-Cache', 'MISS')}"
        if remaining is not None:
            summary += f", {remaining} captures left this period"
        summary += ")."
        if len(data) > self._max_image_bytes:
            summary += (
                f" Image is over the {self._max_image_bytes} byte limit for the model and was left out. "
                "Try full_page false, a smaller viewport, or format jpeg with lower quality."
            )
            return [TextBlock(text=summary)]
        if size and max(size) > self._max_image_dimension:
            summary += (
                f" Image is over the {self._max_image_dimension} px limit for the model and was left out. "
                "Try full_page false or a shorter viewport."
            )
            return [TextBlock(text=summary)]
        return [TextBlock(text=summary), ImageBlock(image=data, image_mimetype=media_type)]

    @staticmethod
    def _extract_text(response: httpx.Response) -> str:
        data = response.json()
        content = data.get("content")
        if not isinstance(content, str):
            import json

            content = json.dumps(content, indent=2, ensure_ascii=False)
        meta = f"type {data.get('type')}"
        if data.get("wordCount"):
            meta += f", {data['wordCount']} words"
        return f"{content}\n\n---\nSource: {data.get('url')} ({meta})"

    # -- tools ----------------------------------------------------------------------

    def take_screenshot(
        self,
        url: Optional[str] = None,
        html: Optional[str] = None,
        format: Optional[ImageFormat] = None,
        full_page: Optional[bool] = None,
        lazy_load: Optional[bool] = None,
        device: Optional[Device] = None,
        width: Optional[int] = None,
        height: Optional[int] = None,
        dark_mode: Optional[bool] = None,
        delay: Optional[int] = None,
        quality: Optional[int] = None,
        hide_selectors: Optional[str] = None,
        click_selector: Optional[str] = None,
        block_ads: Optional[bool] = None,
        block_cookie_banners: Optional[bool] = None,
        cache: Optional[bool] = None,
    ) -> List[Union[TextBlock, ImageBlock]]:
        """Capture a screenshot of a public web page (or raw HTML) in a real Chrome browser and look at it.

        Use it to check layout, visuals, a phone view (device) or a whole page (full_page).
        Ads and cookie banners are removed by default. Cannot reach localhost, private
        networks or pages behind a login.

        Args:
            url: Public http or https URL to capture. Use this or html, not both.
            html: Raw HTML to render instead of a URL (max 2 MB).
            format: Image format: jpeg (default, smallest), png or webp.
            full_page: Capture the whole scrollable page instead of the first screen.
            lazy_load: With full_page, scroll first so lazy-loaded images appear. Slower.
            device: Emulate iphone_14, iphone_15_pro, pixel_7, ipad_pro or macbook_pro. Omit for desktop.
            width: Viewport width in CSS pixels (320-3840, default 1280).
            height: Viewport height in CSS pixels (200-10000, default 800).
            dark_mode: Emulate prefers-color-scheme: dark.
            delay: Extra wait in milliseconds after load (0-10000).
            quality: JPEG or WebP quality (1-100).
            hide_selectors: Comma-separated CSS selectors to hide before capture.
            click_selector: CSS selector to click before capture.
            block_ads: Block ads and trackers (default true).
            block_cookie_banners: Remove cookie consent banners (default true).
            cache: Accept a copy from the last 24 hours (free). Default false: render now.
        """
        params = {k: v for k, v in locals().items() if k != "self"}
        body = self._screenshot_body(**params)
        return self._screenshot_blocks(url or "html", self._post("/v1/screenshot", body))

    async def atake_screenshot(
        self,
        url: Optional[str] = None,
        html: Optional[str] = None,
        format: Optional[ImageFormat] = None,
        full_page: Optional[bool] = None,
        lazy_load: Optional[bool] = None,
        device: Optional[Device] = None,
        width: Optional[int] = None,
        height: Optional[int] = None,
        dark_mode: Optional[bool] = None,
        delay: Optional[int] = None,
        quality: Optional[int] = None,
        hide_selectors: Optional[str] = None,
        click_selector: Optional[str] = None,
        block_ads: Optional[bool] = None,
        block_cookie_banners: Optional[bool] = None,
        cache: Optional[bool] = None,
    ) -> List[Union[TextBlock, ImageBlock]]:
        """Async version of take_screenshot."""
        params = {k: v for k, v in locals().items() if k != "self"}
        body = self._screenshot_body(**params)
        return self._screenshot_blocks(url or "html", await self._apost("/v1/screenshot", body))

    def extract_content(
        self,
        url: str,
        type: Optional[ExtractType] = None,
        selector: Optional[str] = None,
        max_length: Optional[int] = None,
        delay: Optional[int] = None,
        block_ads: Optional[bool] = None,
        block_cookie_banners: Optional[bool] = None,
        cache: Optional[bool] = None,
    ) -> str:
        """Read a public web page after it renders in a real browser and return its content.

        JavaScript runs and cookie banners are removed, so it reads pages that plain HTTP
        fetches get wrong.

        Args:
            url: Public http or https URL to read.
            type: markdown (default, full page), article (main text only), text, html,
                links (list of links) or metadata (title, description, Open Graph).
            selector: CSS selector to read only part of the page, e.g. 'main'.
            max_length: Maximum characters to return (default 100000).
            delay: Extra wait in milliseconds after load (0-10000).
            block_ads: Block ads and trackers (default true).
            block_cookie_banners: Remove cookie consent banners (default true).
            cache: Accept a cached result from the last 24 hours. Default false.
        """
        params = _compact({k: v for k, v in locals().items() if k != "self"})
        return self._extract_text(self._post("/v1/extract", params))

    async def aextract_content(
        self,
        url: str,
        type: Optional[ExtractType] = None,
        selector: Optional[str] = None,
        max_length: Optional[int] = None,
        delay: Optional[int] = None,
        block_ads: Optional[bool] = None,
        block_cookie_banners: Optional[bool] = None,
        cache: Optional[bool] = None,
    ) -> str:
        """Async version of extract_content."""
        params = _compact({k: v for k, v in locals().items() if k != "self"})
        return self._extract_text(await self._apost("/v1/extract", params))
