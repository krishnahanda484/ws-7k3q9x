from __future__ import annotations

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.data.store import DataRepository
from app.main import create_app


def ts(s: str) -> pd.Timestamp:
    return pd.Timestamp(s, tz="UTC")


def fc_df(rows):
    """rows: (start, publish, mw) strings/numbers."""
    return pd.DataFrame(
        [(ts(a), ts(b), c, "test") for a, b, c in rows],
        columns=["start_time_utc", "publish_time_utc", "generation_mw", "source"],
    )


def act_df(rows):
    return pd.DataFrame(
        [(ts(a), c, "WIND", "test") for a, c in rows],
        columns=["start_time_utc", "generation_mw", "fuel_type", "source"],
    )


@pytest.fixture
def small_repo() -> DataRepository:
    """Two-day synthetic fixture for TESTS ONLY (never shipped or served as real data).
    Day 2026-01-02 hourly forecasts: an early vintage (pub 01-01 06:00, 1000 MW) and a later one
    (pub 01-01 12:00, 1200 MW) for every hour; actuals are 1100 MW on the hour and 900 on the half hour."""
    f, a = [], []
    for h in range(24):
        t = f"2026-01-02 {h:02d}:00"
        f += [(t, "2026-01-01 06:00", 1000.0), (t, "2026-01-01 12:00", 1200.0)]
        a += [(t, 1100.0), (f"2026-01-02 {h:02d}:30", 900.0)]
    manifest = {"data_mode": "test_fixture", "description": "unit-test fixture", "extracted_at_utc": "x"}
    return DataRepository(actuals=act_df(a), forecasts=fc_df(f), manifest=manifest)


@pytest.fixture
def client(small_repo, monkeypatch):
    monkeypatch.setenv("WINDOW_START", "2026-01-01")
    monkeypatch.setenv("WINDOW_END", "2026-01-31")
    from app.core.config import get_settings
    get_settings.cache_clear()
    app = create_app()
    app.state.repo = small_repo
    with TestClient(app) as c:
        app.state.repo = small_repo  # lifespan may reset it when no data dir exists
        yield c
    get_settings.cache_clear()
