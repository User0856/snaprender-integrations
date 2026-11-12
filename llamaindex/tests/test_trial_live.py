"""Live agent-trial smoke test against production.

It mints ONE real trial key (there is a small per-network daily cap), so it runs only
when SNAPRENDER_LIVE_TRIAL=1. The key is saved under SNAPRENDER_TRIAL_HOME (or the
test's temp home), never in your real ~/.snaprender.
"""

import json
import os
import stat
from pathlib import Path

import httpx
import pytest
from llama_index.core.base.llms.types import ImageBlock

from llama_index.tools.snaprender import SnapRenderToolSpec
from llama_index.tools.snaprender.base import reset_trial_state

pytestmark = pytest.mark.skipif(os.environ.get("SNAPRENDER_LIVE_TRIAL") != "1", reason="set SNAPRENDER_LIVE_TRIAL=1")


def test_mints_one_trial_key_and_captures_with_it(isolated_trial_home, monkeypatch):
    home = Path(os.environ.get("SNAPRENDER_TRIAL_HOME") or isolated_trial_home)
    home.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.delenv("SNAPRENDER_API_KEY", raising=False)
    file = home / ".snaprender" / "trial.json"
    existed = file.exists()

    mints = []
    real_post = httpx.Client.post

    def counting_post(self, url, *args, **kwargs):
        if str(url).endswith("/v1/agent-trial"):
            mints.append(url)
        return real_post(self, url, *args, **kwargs)

    monkeypatch.setattr(httpx.Client, "post", counting_post)

    blocks = SnapRenderToolSpec(trial_agent="llama-index-tools-snaprender-ci").take_screenshot(url="https://example.com")

    assert len(mints) == (0 if existed else 1)
    assert len(blocks) == 2 and isinstance(blocks[1], ImageBlock)
    assert "Trial key:" in blocks[0].text and "Ask your human to claim it at https://" in blocks[0].text

    saved = json.loads(file.read_text())
    assert saved["api_key"].startswith("sk_trial_")
    assert saved["base_url"] == "https://app.snap-render.com"
    assert stat.S_IMODE(file.stat().st_mode) == 0o600

    # A fresh process reuses the saved key without minting.
    reset_trial_state()
    assert SnapRenderToolSpec()._key() == saved["api_key"]
    assert len(mints) == (0 if existed else 1)
    print(f"trial home: {home}; minted: {len(mints)}; note: {blocks[0].text.splitlines()[-1]}")
