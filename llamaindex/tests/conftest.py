import pytest

from llama_index.tools.snaprender.base import reset_trial_state


@pytest.fixture(autouse=True)
def isolated_trial_home(tmp_path, monkeypatch):
    """Every test gets its own home directory, so no test reads or writes the real ~/.snaprender."""
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("USERPROFILE", str(home))
    reset_trial_state()
    yield home
    reset_trial_state()
