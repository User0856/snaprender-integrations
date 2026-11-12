"""SnapRender tool spec: website screenshots and rendered page content for LlamaIndex agents."""


import asyncio
import json
import os
import re
import struct
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Literal, Optional, Tuple, Union

import httpx
from llama_index.core.base.llms.types import ImageBlock, TextBlock
from llama_index.core.tools.tool_spec.base import BaseToolSpec

__version__ = "0.2.0"

DEFAULT_BASE_URL = "https://app.snap-render.com"
SIGNUP_URL = "https://app.snap-render.com/auth/signup"
TRIAL_DOCS_URL = "https://snap-render.com/docs/agent-trial"
TRIAL_HEADER = "X-SnapRender-Trial"
DEFAULT_TRIAL_AGENT = "llama-index-tools-snaprender"

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


def _with_note(text: str, note: Optional[str]) -> str:
    return f"{text}\n{note}" if note else text


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


# -- keyless agent trial ------------------------------------------------------------
#
# With no API key configured, the tools mint a free trial key (POST /v1/agent-trial)
# on first use and keep it in ~/.snaprender/trial.json, the same file and format as
# snaprender-mcp and snaprender-ai-sdk, so every SnapRender tool on a machine shares
# one trial key. The key is reused until the API says otherwise: a claimed key keeps
# working after its trial expiry, so expires_at is informational only.
# Docs: https://snap-render.com/docs/agent-trial

_SET_KEY_HINT = "Then set SNAPRENDER_API_KEY or pass api_key."


class _TrialState:
    def __init__(self) -> None:
        self.active: Optional[Dict[str, str]] = None
        # The mint response's instructions, added once to the first trial result.
        self.pending_instructions: Optional[str] = None
        # After a refused mint (per-network or daily cap), do not ask again before this time.
        self.blocked_until = 0.0
        self.blocked_error: Optional[SnapRenderError] = None
        self.async_lock: Optional[asyncio.Lock] = None
        self.async_lock_loop: Any = None


_trial_states: Dict[str, _TrialState] = {}
_trial_lock = threading.RLock()


def _trial_state(base_url: str) -> _TrialState:
    with _trial_lock:
        state = _trial_states.get(base_url)
        if state is None:
            state = _trial_states[base_url] = _TrialState()
        return state


def reset_trial_state() -> None:
    """Forget every in-memory trial key (tests)."""
    with _trial_lock:
        _trial_states.clear()


def _trial_file() -> Path:
    return Path.home() / ".snaprender" / "trial.json"


def _read_trial_cache(base_url: str) -> Optional[Dict[str, str]]:
    try:
        data = json.loads(_trial_file().read_text(encoding="utf-8"))
    except Exception:
        return None
    if isinstance(data, dict) and isinstance(data.get("api_key"), str) and data["api_key"] and data.get("base_url") == base_url:
        return data
    return None


def _write_trial_cache(trial: Dict[str, str]) -> None:
    path = _trial_file()
    try:
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        try:
            os.chmod(path.parent, 0o700)
        except OSError:
            pass
        fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(json.dumps(trial, indent=2) + "\n")
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
    except Exception:
        # Read-only home or similar: keep the key in memory only.
        pass


def _delete_trial_cache() -> None:
    try:
        _trial_file().unlink()
    except Exception:
        pass


def _trial_from_mint(response: httpx.Response, base_url: str, state: _TrialState) -> Dict[str, str]:
    try:
        data = response.json()
    except Exception:
        data = None
    if not response.is_success or not isinstance(data, dict) or not isinstance(data.get("api_key"), str) or not data["api_key"]:
        err = (data or {}).get("error") if isinstance(data, dict) else None
        err = err if isinstance(err, dict) else {}
        signup = err.get("signup_url") or SIGNUP_URL
        message = err.get("message") or (
            f"The free trial key is not available right now. Ask your human to create a free account at {signup} "
            "(200 captures a month)."
        )
        retry_after: Optional[float] = None
        try:
            retry_after = float(response.headers.get("Retry-After", ""))
        except ValueError:
            pass
        error = SnapRenderError(
            response.status_code if not response.is_success else 502,
            err.get("code") or f"HTTP_{response.status_code}",
            f"{message} {_SET_KEY_HINT}",
            retry_after if retry_after and retry_after > 0 else None,
        )
        if error.retry_after:
            state.blocked_error = error
            state.blocked_until = time.time() + error.retry_after
        raise error
    trial = {
        "api_key": data["api_key"],
        "claim_url": data["claim_url"] if isinstance(data.get("claim_url"), str) else SIGNUP_URL,
        "expires_at": data["expires_at"] if isinstance(data.get("expires_at"), str) else "",
        "created_at": _now_iso(),
        "base_url": base_url,
    }
    _write_trial_cache(trial)
    state.pending_instructions = data["instructions"] if isinstance(data.get("instructions"), str) else None
    return trial


def _now_iso() -> str:
    now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def _unreachable_error() -> SnapRenderError:
    return SnapRenderError(
        503,
        "AGENT_TRIAL_UNAVAILABLE",
        "Could not reach SnapRender to start a free trial key. Ask your human to create a free account at "
        f"{SIGNUP_URL} (200 captures a month). {_SET_KEY_HINT}",
    )


def _error_code(response: httpx.Response) -> Optional[str]:
    try:
        return (response.json().get("error") or {}).get("code")
    except Exception:
        return None


def _trial_note(header: Optional[str], state: Optional[_TrialState]) -> Optional[str]:
    """The note an agent passes to its human. None without the X-SnapRender-Trial header
    (always the case for account keys and claimed trial keys)."""
    if not header:
        return None
    lines: List[str] = []
    if state is not None and state.pending_instructions:
        lines.append(state.pending_instructions)
        state.pending_instructions = None
    remaining = re.search(r"remaining=(\d+)", header)
    claim_match = re.search(r"claim=(\S+?);?\s*$", header)
    if claim_match:
        claim = claim_match.group(1)
    elif state is not None and state.active:
        claim = state.active.get("claim_url") or SIGNUP_URL
    else:
        claim = SIGNUP_URL
    if remaining:
        lines.append(
            f"Trial key: {remaining.group(1)} captures left. Ask your human to claim it at {claim} "
            "to remove the watermark and get 200 free captures a month."
        )
    return "\n".join(lines) if lines else None


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
        trial: bool = True,
        trial_agent: Optional[str] = None,
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
            trial: With no key from api_key, get_api_key or SNAPRENDER_API_KEY, use a free
                agent trial key (100 watermarked captures over 7 days), minted on first use
                and shared through ~/.snaprender/trial.json with other SnapRender tools.
                Results then carry a claim link for your human. Set False to raise
                MISSING_API_KEY instead. See https://snap-render.com/docs/agent-trial
            trial_agent: Name sent when minting a trial key, shown on the claim page.
        """
        self._api_key = api_key
        self._get_api_key = get_api_key
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._max_retries = max_retries
        self._max_image_bytes = max_image_bytes
        self._max_image_dimension = max_image_dimension
        self._trial = trial
        self._trial_agent = trial_agent or DEFAULT_TRIAL_AGENT

    # -- key and HTTP ---------------------------------------------------------------

    def _configured_key(self) -> Optional[str]:
        key = self._api_key or (self._get_api_key() if self._get_api_key else None)
        return key or os.environ.get("SNAPRENDER_API_KEY") or None

    def _missing_key_error(self) -> SnapRenderError:
        return SnapRenderError(
            401,
            "MISSING_API_KEY",
            "No API key. Set SNAPRENDER_API_KEY or pass api_key. "
            f"Get a free key (200 captures a month) at {SIGNUP_URL}",
        )

    def _key(self) -> str:
        key = self._configured_key()
        if key:
            return key
        if not self._trial:
            raise self._missing_key_error()
        return self._trial_key()["api_key"]

    def _headers(self, key: Optional[str] = None) -> Dict[str, str]:
        return {
            "X-API-Key": key or self._key(),
            "Content-Type": "application/json",
            "User-Agent": f"llama-index-tools-snaprender/{__version__}",
        }

    # -- trial key (only when no key is configured) ---------------------------------

    def _mint_request(self) -> Dict[str, Any]:
        return {
            "url": f"{self._base_url}/v1/agent-trial",
            "json": {"agent": self._trial_agent},
            "headers": {
                "Content-Type": "application/json",
                "User-Agent": f"llama-index-tools-snaprender/{__version__}",
            },
        }

    def _trial_key(self) -> Dict[str, str]:
        state = _trial_state(self._base_url)
        with _trial_lock:
            if state.active:
                return state.active
            trial = _read_trial_cache(self._base_url) or self._mint(state)
            state.active = trial
            return trial

    def _mint(self, state: _TrialState) -> Dict[str, str]:
        if state.blocked_error is not None and time.time() < state.blocked_until:
            raise state.blocked_error
        try:
            with httpx.Client(timeout=self._timeout) as client:
                response = client.post(**self._mint_request())
        except httpx.HTTPError:
            raise _unreachable_error() from None
        return _trial_from_mint(response, self._base_url, state)

    def _remint(self, stale: Dict[str, str]) -> Dict[str, str]:
        state = _trial_state(self._base_url)
        with _trial_lock:
            if state.active and state.active["api_key"] != stale["api_key"]:
                return state.active
            state.active = None
            _delete_trial_cache()
            state.active = self._mint(state)
            return state.active

    def _async_lock(self, state: _TrialState) -> asyncio.Lock:
        loop = asyncio.get_running_loop()
        if state.async_lock is None or state.async_lock_loop is not loop:
            state.async_lock = asyncio.Lock()
            state.async_lock_loop = loop
        return state.async_lock

    async def _amint(self, state: _TrialState) -> Dict[str, str]:
        if state.blocked_error is not None and time.time() < state.blocked_until:
            raise state.blocked_error
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(**self._mint_request())
        except httpx.HTTPError:
            raise _unreachable_error() from None
        return _trial_from_mint(response, self._base_url, state)

    async def _atrial_key(self) -> Dict[str, str]:
        state = _trial_state(self._base_url)
        async with self._async_lock(state):
            if state.active:
                return state.active
            trial = _read_trial_cache(self._base_url) or await self._amint(state)
            state.active = trial
            return trial

    async def _aremint(self, stale: Dict[str, str]) -> Dict[str, str]:
        state = _trial_state(self._base_url)
        async with self._async_lock(state):
            if state.active and state.active["api_key"] != stale["api_key"]:
                return state.active
            state.active = None
            _delete_trial_cache()
            state.active = await self._amint(state)
            return state.active

    def _auth(self) -> Tuple[str, Optional[Dict[str, str]]]:
        key = self._configured_key()
        if key:
            return key, None
        if not self._trial:
            raise self._missing_key_error()
        trial = self._trial_key()
        return trial["api_key"], trial

    async def _aauth(self) -> Tuple[str, Optional[Dict[str, str]]]:
        key = self._configured_key()
        if key:
            return key, None
        if not self._trial:
            raise self._missing_key_error()
        trial = await self._atrial_key()
        return trial["api_key"], trial

    def _note(self, response: httpx.Response) -> Optional[str]:
        return _trial_note(response.headers.get(TRIAL_HEADER), _trial_states.get(self._base_url))

    # -- HTTP -----------------------------------------------------------------------

    def _retry_wait(self, error: SnapRenderError, attempt: int) -> Optional[float]:
        if error.code != "RATE_LIMITED" or attempt >= self._max_retries:
            return None
        wait = error.retry_after or 5.0
        return wait if wait <= 60 else None

    def _post(self, path: str, body: Dict[str, Any]) -> httpx.Response:
        attempt = 0
        while True:
            key, trial = self._auth()
            with httpx.Client(timeout=self._timeout) as client:
                response = client.post(f"{self._base_url}{path}", json=body, headers=self._headers(key))
                if trial is not None and response.status_code == 401 and _error_code(response) == "UNAUTHORIZED":
                    # The API no longer knows the saved trial key (not TRIAL_EXPIRED, which stays claimable).
                    fresh = self._remint(trial)
                    response = client.post(f"{self._base_url}{path}", json=body, headers=self._headers(fresh["api_key"]))
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
            key, trial = await self._aauth()
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(f"{self._base_url}{path}", json=body, headers=self._headers(key))
                if trial is not None and response.status_code == 401 and _error_code(response) == "UNAUTHORIZED":
                    fresh = await self._aremint(trial)
                    response = await client.post(
                        f"{self._base_url}{path}", json=body, headers=self._headers(fresh["api_key"])
                    )
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
        note = self._note(response)
        if len(data) > self._max_image_bytes:
            summary += (
                f" Image is over the {self._max_image_bytes} byte limit for the model and was left out. "
                "Try full_page false, a smaller viewport, or format jpeg with lower quality."
            )
            return [TextBlock(text=_with_note(summary, note))]
        if size and max(size) > self._max_image_dimension:
            summary += (
                f" Image is over the {self._max_image_dimension} px limit for the model and was left out. "
                "Try full_page false or a shorter viewport."
            )
            return [TextBlock(text=_with_note(summary, note))]
        return [TextBlock(text=_with_note(summary, note)), ImageBlock(image=data, image_mimetype=media_type)]

    def _extract_text(self, response: httpx.Response) -> str:
        data = response.json()
        content = data.get("content")
        if not isinstance(content, str):
            content = json.dumps(content, indent=2, ensure_ascii=False)
        meta = f"type {data.get('type')}"
        if data.get("wordCount"):
            meta += f", {data['wordCount']} words"
        return _with_note(f"{content}\n\n---\nSource: {data.get('url')} ({meta})", self._note(response))

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
