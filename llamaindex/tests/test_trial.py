"""Keyless agent trial: mint, reuse, expiry and error handling, with mocked HTTP."""

import asyncio
import base64
import json
import stat

import httpx
import pytest
import respx
from llama_index.core.base.llms.types import ImageBlock

from llama_index.tools.snaprender import SnapRenderError, SnapRenderToolSpec

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
API = "https://app.snap-render.com"
CLAIM = "https://app.snap-render.com/claim/abc123"


@pytest.fixture(autouse=True)
def no_env_key(monkeypatch):
    monkeypatch.delenv("SNAPRENDER_API_KEY", raising=False)


def trial_file(home):
    return home / ".snaprender" / "trial.json"


def write_trial(home, **fields):
    data = {"api_key": "sk_trial_saved", "claim_url": CLAIM, "expires_at": "", "created_at": "", "base_url": API}
    data.update(fields)
    trial_file(home).parent.mkdir(parents=True, exist_ok=True)
    trial_file(home).write_text(json.dumps(data))


def mint_response(key="sk_trial_one"):
    return httpx.Response(
        201,
        json={
            "api_key": key,
            "key_type": "trial",
            "limits": {"total": 100, "per_day": 30},
            "expires_at": "2026-11-19T00:00:00.000Z",
            "claim_url": CLAIM,
            "signup_url": f"{API}/auth/signup",
            "upgrade_url": "https://snap-render.com/pricing",
            "docs_url": "https://snap-render.com/docs/agent-trial",
            "instructions": f"Tell your human: claim it at {CLAIM}.",
        },
    )


def shot_response(remaining=99):
    return httpx.Response(
        200,
        content=PNG,
        headers={"Content-Type": "image/jpeg", "X-SnapRender-Trial": f"remaining={remaining}; claim={CLAIM}"},
    )


def error_response(status, code, message, headers=None):
    return httpx.Response(status, json={"error": {"code": code, "message": message}}, headers=headers or {})


def keys_used(route):
    return [call.request.headers.get("X-API-Key") for call in route.calls]


@respx.mock
def test_mints_on_first_use_saves_like_mcp_and_notes_claim_link(isolated_trial_home):
    mint = respx.post(f"{API}/v1/agent-trial").mock(return_value=mint_response())
    shot = respx.post(f"{API}/v1/screenshot").mock(return_value=shot_response())

    blocks = SnapRenderToolSpec().take_screenshot(url="https://a.test")

    request = mint.calls.last.request
    assert json.loads(request.content) == {"agent": "llama-index-tools-snaprender"}
    assert "X-API-Key" not in request.headers
    assert keys_used(shot) == ["sk_trial_one"]

    path = trial_file(isolated_trial_home)
    saved = json.loads(path.read_text())
    assert sorted(saved) == ["api_key", "base_url", "claim_url", "created_at", "expires_at"]
    assert saved["api_key"] == "sk_trial_one" and saved["claim_url"] == CLAIM and saved["base_url"] == API
    assert saved["expires_at"] == "2026-11-19T00:00:00.000Z"
    assert saved["created_at"].endswith("Z")
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert stat.S_IMODE(path.parent.stat().st_mode) == 0o700

    assert len(blocks) == 2 and isinstance(blocks[1], ImageBlock)
    assert f"Tell your human: claim it at {CLAIM}." in blocks[0].text
    assert f"Trial key: 99 captures left. Ask your human to claim it at {CLAIM}" in blocks[0].text


@respx.mock
def test_instructions_once_then_short_note():
    respx.post(f"{API}/v1/agent-trial").mock(return_value=mint_response())
    respx.post(f"{API}/v1/screenshot").mock(side_effect=[shot_response(99), shot_response(98)])
    spec = SnapRenderToolSpec()
    spec.take_screenshot(url="https://a.test")
    second = spec.take_screenshot(url="https://b.test")
    assert "Tell your human" not in second[0].text
    assert second[0].text.endswith(
        f"\nTrial key: 98 captures left. Ask your human to claim it at {CLAIM} "
        "to remove the watermark and get 200 free captures a month."
    )


@respx.mock
def test_trial_agent_name():
    mint = respx.post(f"{API}/v1/agent-trial").mock(return_value=mint_response())
    respx.post(f"{API}/v1/screenshot").mock(return_value=shot_response())
    SnapRenderToolSpec(trial_agent="my-research-bot").take_screenshot(url="https://a.test")
    assert json.loads(mint.calls.last.request.content) == {"agent": "my-research-bot"}


@respx.mock
def test_reuses_key_saved_by_another_tool(isolated_trial_home):
    write_trial(isolated_trial_home, api_key="sk_trial_from_mcp", created_at="2026-11-12T00:00:00.000Z")
    mint = respx.post(f"{API}/v1/agent-trial").mock(return_value=mint_response())
    shot = respx.post(f"{API}/v1/screenshot").mock(return_value=shot_response())
    SnapRenderToolSpec().take_screenshot(url="https://a.test")
    assert mint.call_count == 0
    assert keys_used(shot) == ["sk_trial_from_mcp"]


@respx.mock
def test_keeps_using_saved_key_past_expires_at_claimed_keys_keep_working(isolated_trial_home):
    write_trial(isolated_trial_home, api_key="sk_trial_claimed", expires_at="2020-01-01T00:00:00.000Z")
    mint = respx.post(f"{API}/v1/agent-trial").mock(return_value=mint_response())
    shot = respx.post(f"{API}/v1/screenshot").mock(
        return_value=httpx.Response(200, content=PNG, headers={"Content-Type": "image/jpeg"})
    )
    blocks = SnapRenderToolSpec().take_screenshot(url="https://a.test")
    assert mint.call_count == 0
    assert keys_used(shot) == ["sk_trial_claimed"]
    assert "Trial key" not in blocks[0].text


@respx.mock
def test_ignores_saved_key_for_other_base_url(isolated_trial_home):
    write_trial(isolated_trial_home, api_key="sk_trial_staging", base_url="https://staging.test")
    mint = respx.post(f"{API}/v1/agent-trial").mock(return_value=mint_response())
    shot = respx.post(f"{API}/v1/screenshot").mock(return_value=shot_response())
    SnapRenderToolSpec().take_screenshot(url="https://a.test")
    assert mint.call_count == 1
    assert keys_used(shot) == ["sk_trial_one"]


@respx.mock
def test_ignores_unreadable_file(isolated_trial_home):
    trial_file(isolated_trial_home).parent.mkdir(parents=True)
    trial_file(isolated_trial_home).write_text("{not json")
    mint = respx.post(f"{API}/v1/agent-trial").mock(return_value=mint_response())
    respx.post(f"{API}/v1/screenshot").mock(return_value=shot_response())
    SnapRenderToolSpec().take_screenshot(url="https://a.test")
    assert mint.call_count == 1


@respx.mock
def test_one_mint_shared_by_both_tools_and_instances():
    mint = respx.post(f"{API}/v1/agent-trial").mock(return_value=mint_response())
    shot = respx.post(f"{API}/v1/screenshot").mock(return_value=shot_response())
    extract = respx.post(f"{API}/v1/extract").mock(
        return_value=httpx.Response(
            200,
            json={"url": "https://a.test", "type": "markdown", "content": "# Hi"},
            headers={"X-SnapRender-Trial": f"remaining=97; claim={CLAIM}"},
        )
    )
    SnapRenderToolSpec().take_screenshot(url="https://a.test")
    text = SnapRenderToolSpec().extract_content(url="https://a.test")
    assert mint.call_count == 1
    assert keys_used(shot) == keys_used(extract) == ["sk_trial_one"]
    assert "# Hi" in text
    assert text.endswith(
        f"\nTrial key: 97 captures left. Ask your human to claim it at {CLAIM} "
        "to remove the watermark and get 200 free captures a month."
    )


@respx.mock
async def test_async_concurrent_calls_mint_once():
    mint = respx.post(f"{API}/v1/agent-trial").mock(return_value=mint_response())
    shot = respx.post(f"{API}/v1/screenshot").mock(return_value=shot_response())
    respx.post(f"{API}/v1/extract").mock(
        return_value=httpx.Response(200, json={"url": "https://a.test", "type": "markdown", "content": "x"})
    )
    spec = SnapRenderToolSpec()
    await asyncio.gather(
        spec.atake_screenshot(url="https://a.test"),
        spec.atake_screenshot(url="https://b.test"),
        spec.aextract_content(url="https://a.test"),
    )
    assert mint.call_count == 1
    assert keys_used(shot) == ["sk_trial_one", "sk_trial_one"]


@respx.mock
def test_works_without_writable_home(isolated_trial_home):
    (isolated_trial_home / ".snaprender").write_text("a file where the directory should be")
    mint = respx.post(f"{API}/v1/agent-trial").mock(return_value=mint_response())
    shot = respx.post(f"{API}/v1/screenshot").mock(return_value=shot_response())
    spec = SnapRenderToolSpec()
    spec.take_screenshot(url="https://a.test")
    spec.take_screenshot(url="https://b.test")
    assert mint.call_count == 1
    assert keys_used(shot) == ["sk_trial_one", "sk_trial_one"]


@respx.mock
def test_trial_expired_passes_claim_link_and_keeps_key(isolated_trial_home):
    write_trial(isolated_trial_home, api_key="sk_trial_old")
    message = (
        f"This SnapRender trial key expired. Ask your human to claim it at {CLAIM} (a free account, "
        "200 captures a month): the same key then works again with no watermark."
    )
    mint = respx.post(f"{API}/v1/agent-trial").mock(return_value=mint_response())
    shot = respx.post(f"{API}/v1/screenshot").mock(return_value=error_response(401, "TRIAL_EXPIRED", message))
    with pytest.raises(SnapRenderError) as info:
        SnapRenderToolSpec().take_screenshot(url="https://a.test")
    assert info.value.status == 401 and info.value.code == "TRIAL_EXPIRED"
    assert CLAIM in str(info.value)
    assert mint.call_count == 0 and shot.call_count == 1
    assert trial_file(isolated_trial_home).exists()


@respx.mock
def test_unknown_saved_key_is_reminted_once(isolated_trial_home):
    write_trial(isolated_trial_home, api_key="sk_trial_gone")
    mint = respx.post(f"{API}/v1/agent-trial").mock(return_value=mint_response("sk_trial_new"))
    shot = respx.post(f"{API}/v1/screenshot").mock(
        side_effect=lambda request: error_response(401, "UNAUTHORIZED", "Invalid API key")
        if request.headers["X-API-Key"] == "sk_trial_gone"
        else shot_response()
    )
    blocks = SnapRenderToolSpec().take_screenshot(url="https://a.test")
    assert isinstance(blocks[1], ImageBlock)
    assert mint.call_count == 1
    assert keys_used(shot) == ["sk_trial_gone", "sk_trial_new"]
    assert json.loads(trial_file(isolated_trial_home).read_text())["api_key"] == "sk_trial_new"


@respx.mock
async def test_unknown_saved_key_is_reminted_once_async(isolated_trial_home):
    write_trial(isolated_trial_home, api_key="sk_trial_gone")
    mint = respx.post(f"{API}/v1/agent-trial").mock(return_value=mint_response("sk_trial_new"))
    shot = respx.post(f"{API}/v1/screenshot").mock(
        side_effect=lambda request: error_response(401, "UNAUTHORIZED", "Invalid API key")
        if request.headers["X-API-Key"] == "sk_trial_gone"
        else shot_response()
    )
    await SnapRenderToolSpec().atake_screenshot(url="https://a.test")
    assert mint.call_count == 1
    assert keys_used(shot) == ["sk_trial_gone", "sk_trial_new"]


@respx.mock
def test_refused_mint_429_explains_and_waits_for_retry_after(isolated_trial_home):
    mint = respx.post(f"{API}/v1/agent-trial").mock(
        return_value=error_response(
            429,
            "AGENT_TRIAL_LIMIT",
            f"This network already started 3 trial keys today. Ask your human to create a free account at {API}/auth/signup "
            "(200 captures a month, no card) and use that key.",
            {"Retry-After": "3600"},
        )
    )
    shot = respx.post(f"{API}/v1/screenshot").mock(return_value=shot_response())
    spec = SnapRenderToolSpec()
    with pytest.raises(SnapRenderError) as info:
        spec.take_screenshot(url="https://a.test")
    assert info.value.status == 429 and info.value.code == "AGENT_TRIAL_LIMIT"
    assert "create a free account" in info.value.message and "SNAPRENDER_API_KEY" in info.value.message
    assert info.value.retry_after == 3600
    with pytest.raises(SnapRenderError, match="AGENT_TRIAL_LIMIT"):
        spec.take_screenshot(url="https://b.test")
    assert mint.call_count == 1 and shot.call_count == 0
    assert not trial_file(isolated_trial_home).exists()


@respx.mock
async def test_refused_mint_503_async_then_next_call_tries_again():
    mint = respx.post(f"{API}/v1/agent-trial").mock(
        side_effect=[
            error_response(503, "AGENT_TRIAL_UNAVAILABLE", "Trial keys are not available right now."),
            mint_response(),
        ]
    )
    respx.post(f"{API}/v1/screenshot").mock(return_value=shot_response())
    spec = SnapRenderToolSpec()
    with pytest.raises(SnapRenderError) as info:
        await spec.atake_screenshot(url="https://a.test")
    assert info.value.status == 503 and info.value.code == "AGENT_TRIAL_UNAVAILABLE"
    await spec.atake_screenshot(url="https://a.test")
    assert mint.call_count == 2


@respx.mock
def test_mint_network_failure_explains():
    respx.post(f"{API}/v1/agent-trial").mock(side_effect=httpx.ConnectError("down"))
    with pytest.raises(SnapRenderError) as info:
        SnapRenderToolSpec().take_screenshot(url="https://a.test")
    assert info.value.code == "AGENT_TRIAL_UNAVAILABLE" and "auth/signup" in info.value.message


@respx.mock
def test_trial_limit_reached_429_not_retried():
    respx.post(f"{API}/v1/agent-trial").mock(return_value=mint_response())
    shot = respx.post(f"{API}/v1/screenshot").mock(
        return_value=error_response(
            429, "TRIAL_LIMIT_REACHED", f"This trial key used its 30 captures for today. Claim it at {CLAIM}.", {"Retry-After": "5"}
        )
    )
    with pytest.raises(SnapRenderError) as info:
        SnapRenderToolSpec().take_screenshot(url="https://a.test")
    assert info.value.code == "TRIAL_LIMIT_REACHED" and CLAIM in info.value.message
    assert shot.call_count == 1


@respx.mock
def test_trial_busy_503_not_retried():
    respx.post(f"{API}/v1/agent-trial").mock(return_value=mint_response())
    shot = respx.post(f"{API}/v1/screenshot").mock(
        return_value=error_response(503, "TRIAL_BUSY", f"Trial captures are busy. Claim it at {CLAIM}.", {"Retry-After": "30"})
    )
    with pytest.raises(SnapRenderError) as info:
        SnapRenderToolSpec().take_screenshot(url="https://a.test")
    assert info.value.status == 503 and info.value.code == "TRIAL_BUSY"
    assert shot.call_count == 1


# -- explicit keys are unchanged ---------------------------------------------------------


@respx.mock
def test_explicit_key_never_mints_or_reads_trial_file(isolated_trial_home):
    write_trial(isolated_trial_home)
    mint = respx.post(f"{API}/v1/agent-trial").mock(return_value=mint_response())
    shot = respx.post(f"{API}/v1/screenshot").mock(
        return_value=httpx.Response(200, content=PNG, headers={"Content-Type": "image/jpeg", "X-Remaining-Credits": "5"})
    )
    blocks = SnapRenderToolSpec(api_key="sk_live_mine").take_screenshot(url="https://a.test")
    assert mint.call_count == 0 and keys_used(shot) == ["sk_live_mine"]
    assert blocks[0].text == f"Screenshot of https://a.test (1x1 px, {len(PNG)} bytes, cache MISS, 5 captures left this period)."


@respx.mock
def test_env_key_and_callable_win_over_trial(isolated_trial_home, monkeypatch):
    write_trial(isolated_trial_home)
    mint = respx.post(f"{API}/v1/agent-trial").mock(return_value=mint_response())
    shot = respx.post(f"{API}/v1/screenshot").mock(return_value=httpx.Response(200, content=PNG))
    SnapRenderToolSpec(get_api_key=lambda: "sk_live_cb").take_screenshot(url="https://a.test")
    monkeypatch.setenv("SNAPRENDER_API_KEY", "sk_live_env")
    SnapRenderToolSpec().take_screenshot(url="https://a.test")
    assert mint.call_count == 0
    assert keys_used(shot) == ["sk_live_cb", "sk_live_env"]


@respx.mock
def test_explicit_key_401_is_never_reminted():
    mint = respx.post(f"{API}/v1/agent-trial").mock(return_value=mint_response())
    shot = respx.post(f"{API}/v1/screenshot").mock(return_value=error_response(401, "UNAUTHORIZED", "Invalid API key"))
    with pytest.raises(SnapRenderError) as info:
        SnapRenderToolSpec(api_key="sk_live_bad").take_screenshot(url="https://a.test")
    assert info.value.status == 401
    assert mint.call_count == 0 and shot.call_count == 1


@respx.mock
def test_trial_false_raises_missing_key_without_requests():
    mint = respx.post(f"{API}/v1/agent-trial").mock(return_value=mint_response())
    with pytest.raises(SnapRenderError) as info:
        SnapRenderToolSpec(trial=False).take_screenshot(url="https://a.test")
    assert info.value.code == "MISSING_API_KEY"
    assert mint.call_count == 0
