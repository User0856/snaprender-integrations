import base64
import json
import struct

import httpx
import pytest
import respx
from llama_index.core.base.llms.types import ImageBlock, TextBlock
from llama_index.core.tools.tool_spec.base import BaseToolSpec

from llama_index.tools.snaprender import SnapRenderError, SnapRenderToolSpec
from llama_index.tools.snaprender.base import image_size

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
API = "https://app.snap-render.com"


def png_of_size(width: int, height: int) -> bytes:
    return PNG[:16] + struct.pack(">II", width, height) + PNG[24:]


def test_is_a_tool_spec_with_sync_and_async_tools():
    tools = SnapRenderToolSpec(api_key="k").to_tool_list()
    assert isinstance(SnapRenderToolSpec(api_key="k"), BaseToolSpec)
    assert [t.metadata.name for t in tools] == ["take_screenshot", "extract_content"]
    assert all(t.async_fn is not None for t in tools)
    device = tools[0].metadata.get_parameters_dict()["properties"]["device"]
    assert device["anyOf"][0]["enum"] == ["iphone_14", "iphone_15_pro", "pixel_7", "ipad_pro", "macbook_pro"]


@respx.mock
def test_take_screenshot_posts_defaults_and_returns_image_block():
    route = respx.post(f"{API}/v1/screenshot").mock(
        return_value=httpx.Response(
            200, content=PNG, headers={"Content-Type": "image/jpeg", "X-Cache": "MISS", "X-Remaining-Credits": "41"}
        )
    )
    blocks = SnapRenderToolSpec(api_key="sk_test").take_screenshot(url="https://example.com", device="iphone_14")
    request = route.calls.last.request
    assert request.headers["X-API-Key"] == "sk_test"
    assert request.headers["User-Agent"].startswith("llama-index-tools-snaprender/")
    assert json.loads(request.content) == {
        "url": "https://example.com",
        "device": "iphone_14",
        "format": "jpeg",
        "quality": 80,
        "response_type": "binary",
    }
    assert isinstance(blocks[0], TextBlock)
    assert "1x1 px" in blocks[0].text and "41 captures left" in blocks[0].text
    assert isinstance(blocks[1], ImageBlock)
    assert blocks[1].image_mimetype == "image/jpeg"


@respx.mock
def test_png_sends_no_quality():
    route = respx.post(f"{API}/v1/screenshot").mock(return_value=httpx.Response(200, content=PNG))
    SnapRenderToolSpec(api_key="k").take_screenshot(url="https://a.test", format="png")
    assert "quality" not in json.loads(route.calls.last.request.content)


def test_url_or_html_exactly_one():
    spec = SnapRenderToolSpec(api_key="k")
    with pytest.raises(ValueError):
        spec.take_screenshot()
    with pytest.raises(ValueError):
        spec.take_screenshot(url="https://a.test", html="<p>")


def test_reads_env_key(monkeypatch):
    monkeypatch.setenv("SNAPRENDER_API_KEY", "sk_env")
    assert SnapRenderToolSpec()._key() == "sk_env"


def test_missing_key_explains_free_plan_when_trial_is_off(monkeypatch):
    monkeypatch.delenv("SNAPRENDER_API_KEY", raising=False)
    with pytest.raises(SnapRenderError, match="200 captures a month"):
        SnapRenderToolSpec(trial=False)._key()


def test_get_api_key_callable(monkeypatch):
    monkeypatch.delenv("SNAPRENDER_API_KEY", raising=False)
    assert SnapRenderToolSpec(get_api_key=lambda: "sk_cb")._key() == "sk_cb"


@respx.mock
def test_api_error_code_and_message():
    respx.post(f"{API}/v1/screenshot").mock(
        return_value=httpx.Response(
            422, json={"error": {"code": "TARGET_UNREACHABLE", "message": "The target website could not be reached."}}
        )
    )
    with pytest.raises(SnapRenderError) as info:
        SnapRenderToolSpec(api_key="k").take_screenshot(url="https://nope.test")
    assert info.value.status == 422 and info.value.code == "TARGET_UNREACHABLE"
    assert "could not be reached" in str(info.value)


@respx.mock
def test_non_json_error():
    respx.post(f"{API}/v1/screenshot").mock(return_value=httpx.Response(502, text="error code: 502"))
    with pytest.raises(SnapRenderError, match="502 HTTP_502"):
        SnapRenderToolSpec(api_key="k").take_screenshot(url="https://a.test")


@respx.mock
def test_retries_once_after_rate_limit(monkeypatch):
    monkeypatch.setattr("time.sleep", lambda s: None)
    route = respx.post(f"{API}/v1/screenshot").mock(
        side_effect=[
            httpx.Response(429, json={"error": {"code": "RATE_LIMITED", "message": "Slow down."}}, headers={"Retry-After": "3"}),
            httpx.Response(200, content=PNG),
        ]
    )
    blocks = SnapRenderToolSpec(api_key="k").take_screenshot(url="https://a.test")
    assert route.call_count == 2 and isinstance(blocks[1], ImageBlock)


@respx.mock
def test_never_retries_quota(monkeypatch):
    monkeypatch.setattr("time.sleep", lambda s: None)
    route = respx.post(f"{API}/v1/screenshot").mock(
        return_value=httpx.Response(429, json={"error": {"code": "QUOTA_EXCEEDED", "message": "Monthly limit."}})
    )
    with pytest.raises(SnapRenderError, match="QUOTA_EXCEEDED"):
        SnapRenderToolSpec(api_key="k").take_screenshot(url="https://a.test")
    assert route.call_count == 1


@respx.mock
def test_tall_image_left_out_with_reason():
    respx.post(f"{API}/v1/screenshot").mock(return_value=httpx.Response(200, content=png_of_size(2560, 16000)))
    blocks = SnapRenderToolSpec(api_key="k").take_screenshot(url="https://a.test", full_page=True)
    assert len(blocks) == 1 and "8000 px limit" in blocks[0].text


@respx.mock
def test_extract_markdown_and_links():
    route = respx.post(f"{API}/v1/extract").mock(
        side_effect=[
            httpx.Response(200, json={"url": "https://a.test", "type": "markdown", "content": "# Hi", "wordCount": 1}),
            httpx.Response(200, json={"url": "https://a.test", "type": "links", "content": [{"href": "https://b.test", "text": "B"}]}),
        ]
    )
    spec = SnapRenderToolSpec(api_key="k")
    assert spec.extract_content(url="https://a.test", selector="main") == "# Hi\n\n---\nSource: https://a.test (type markdown, 1 words)"
    assert json.loads(route.calls[0].request.content) == {"url": "https://a.test", "selector": "main"}
    assert '"href": "https://b.test"' in spec.extract_content(url="https://a.test", type="links")


@respx.mock
async def test_async_tools():
    respx.post(f"{API}/v1/screenshot").mock(return_value=httpx.Response(200, content=PNG, headers={"Content-Type": "image/png"}))
    respx.post(f"{API}/v1/extract").mock(return_value=httpx.Response(200, json={"url": "u", "type": "text", "content": "x"}))
    spec = SnapRenderToolSpec(api_key="k")
    blocks = await spec.atake_screenshot(html="<h1>Hi</h1>")
    assert blocks[0].text.startswith("Screenshot of html") and blocks[1].image_mimetype == "image/png"
    assert (await spec.aextract_content(url="u")).startswith("x")


@respx.mock
async def test_function_tool_output_carries_image_block():
    respx.post(f"{API}/v1/screenshot").mock(return_value=httpx.Response(200, content=PNG, headers={"Content-Type": "image/png"}))
    tool = SnapRenderToolSpec(api_key="k").to_tool_list()[0]
    output = await tool.acall(url="https://example.com")
    assert [b.block_type for b in output.blocks] == ["text", "image"]


def test_image_size():
    assert image_size(png_of_size(1280, 800)) == (1280, 800)
    assert image_size(b"nope") is None
