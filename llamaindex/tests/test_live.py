"""Live API tests. Run only when SNAPRENDER_TEST_KEY or SNAPRENDER_API_KEY is set (about 8 captures)."""

import os
import time

import pytest
from llama_index.core.base.llms.types import ImageBlock

from llama_index.tools.snaprender import SnapRenderError, SnapRenderToolSpec

KEY = os.environ.get("SNAPRENDER_TEST_KEY") or os.environ.get("SNAPRENDER_API_KEY")
pytestmark = pytest.mark.skipif(not KEY, reason="no SnapRender key in the environment")


@pytest.fixture(autouse=True)
def pace():
    # The free plan allows 10 requests a minute.
    yield
    time.sleep(6.5)


@pytest.fixture
def spec():
    return SnapRenderToolSpec(api_key=KEY)


def test_screenshot_jpeg(spec):
    blocks = spec.take_screenshot(url="https://example.com")
    assert "2560x1600 px" in blocks[0].text
    assert isinstance(blocks[1], ImageBlock) and blocks[1].image_mimetype == "image/jpeg"


def test_screenshot_device_png(spec):
    blocks = spec.take_screenshot(url="https://example.com", device="pixel_7", format="png")
    assert blocks[1].image_mimetype == "image/png"


def test_screenshot_html_full_page_dark(spec):
    blocks = spec.take_screenshot(html="<h1>Hello from LlamaIndex</h1>", full_page=True, dark_mode=True, width=640, height=360)
    assert blocks[0].text.startswith("Screenshot of html") and len(blocks) == 2


async def test_async_webp(spec):
    blocks = await spec.atake_screenshot(url="https://example.com", format="webp", quality=60)
    assert blocks[1].image_mimetype == "image/webp"


def test_unreachable(spec):
    with pytest.raises(SnapRenderError) as info:
        spec.take_screenshot(url="https://nonexistent-domain-snaprender-test-123.com")
    assert info.value.code == "TARGET_UNREACHABLE"


def test_bad_key():
    with pytest.raises(SnapRenderError) as info:
        SnapRenderToolSpec(api_key="sk_live_invalid").take_screenshot(url="https://example.com")
    assert info.value.status == 401


def test_extract(spec):
    assert "documentation examples" in spec.extract_content(url="https://example.com", max_length=5000)


async def test_async_extract_links(spec):
    assert "iana.org" in await spec.aextract_content(url="https://example.com", type="links")
