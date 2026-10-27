from datetime import date, datetime, timezone

import httpx
import pytest

from app.core.config import Settings
from app.core.errors import UpstreamError
from app.data.elexon_client import ElexonClient
from app.data.normalize import normalize_actuals, normalize_forecasts
from app.utils.timeutil import local_day_bounds_utc, parse_instant, rolling_cutoff_utc
from datetime import time


def fh(start, pub, gen, fuel="WIND"):
    return {"dataset": "FUELHH", "publishTime": pub, "startTime": start, "settlementDate": "2026-01-02",
            "settlementPeriod": 1, "fuelType": fuel, "generation": gen}


def wf(start, pub, gen):
    return {"dataset": "WINDFOR", "publishTime": pub, "startTime": start, "generation": gen}


def test_actuals_filtered_to_wind_only():
    df, q = normalize_actuals([fh("2026-01-02T00:00:00Z", "2026-01-02T00:30:00Z", 100),
                               fh("2026-01-02T00:00:00Z", "2026-01-02T00:30:00Z", 5000, fuel="CCGT")])
    assert df.generation_mw.tolist() == [100] and df.fuel_type.unique().tolist() == ["WIND"]
    assert q["non_wind_rows_dropped"] == 1


def test_null_and_nonnumeric_generation_dropped_not_zeroed():
    df, q = normalize_actuals([fh("2026-01-02T00:00:00Z", "2026-01-02T00:30:00Z", None),
                               fh("2026-01-02T00:30:00Z", "2026-01-02T01:00:00Z", "abc"),
                               fh("2026-01-02T01:00:00Z", "2026-01-02T01:30:00Z", "250")])
    assert df.generation_mw.tolist() == [250]
    assert q["missing_generation_dropped"] == 2


def test_malformed_rows_counted_and_skipped():
    df, q = normalize_forecasts([{"startTime": "not-a-date", "publishTime": "2026-01-01T00:00:00Z", "generation": 1},
                                 wf("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z", 5)])
    assert len(df) == 1 and q["invalid_rows"] == 1


def test_actual_duplicates_keep_latest_publication():
    df, q = normalize_actuals([fh("2026-01-02T00:00:00Z", "2026-01-02T00:30:00Z", 100),
                               fh("2026-01-02T00:00:00Z", "2026-01-02T01:00:00Z", 110)])
    assert df.generation_mw.tolist() == [110] and q["duplicate_rows_collapsed"] == 1


def test_forecast_duplicates_collapse_and_conflicts_counted():
    df, q = normalize_forecasts([wf("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z", 5),
                                 wf("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z", 5),
                                 wf("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z", 7)])
    assert df.generation_mw.tolist() == [7] and q["exact_duplicates"] == 1 and q["conflicting_duplicates"] == 1


def test_forecast_revisions_are_preserved():
    df, _ = normalize_forecasts([wf("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z", 5),
                                 wf("2026-01-02T00:00:00Z", "2026-01-01T06:00:00Z", 6)])
    assert len(df) == 2


def test_empty_input():
    a, _ = normalize_actuals([])
    f, _ = normalize_forecasts([])
    assert a.empty and f.empty


# --- time handling ------------------------------------------------------------------------------
def test_parse_instant_requires_offset_and_converts_to_utc():
    assert parse_instant("2026-01-14T09:00:00+01:00") == datetime(2026, 1, 14, 8, 0, tzinfo=timezone.utc)
    assert parse_instant("2026-01-14T09:00:00Z").hour == 9
    with pytest.raises(ValueError):
        parse_instant("2026-01-14T09:00:00")
    with pytest.raises(ValueError):
        parse_instant("garbage")


def test_london_day_bounds_winter_and_summer():
    s, e = local_day_bounds_utc(date(2026, 1, 15))
    assert (e - s).total_seconds() == 24 * 3600 and s.hour == 0
    s, e = local_day_bounds_utc(date(2026, 6, 15))  # BST: local midnight = 23:00 UTC previous day
    assert s.hour == 23 and s.day == 14
    s, e = local_day_bounds_utc(date(2026, 3, 29))  # spring forward: 23 hour day
    assert (e - s).total_seconds() == 23 * 3600


def test_rolling_cutoff_converts_london_to_utc():
    assert rolling_cutoff_utc(date(2026, 6, 15), 1, time(9, 0)) == datetime(2026, 6, 14, 8, 0, tzinfo=timezone.utc)


# --- client retry behaviour -----------------------------------------------------------------------
def _client(handler, retries=2):
    s = Settings(http_max_retries=retries, http_backoff_seconds=0.0)
    http = httpx.Client(base_url=s.elexon_base_url, transport=httpx.MockTransport(handler))
    return ElexonClient(s, client=http, sleep=lambda _: None)


A, B = datetime(2026, 1, 1, tzinfo=timezone.utc), datetime(2026, 1, 2, tzinfo=timezone.utc)


def test_client_retries_transient_errors_then_succeeds():
    calls = {"n": 0}

    def handler(req):
        calls["n"] += 1
        return httpx.Response(503) if calls["n"] < 3 else httpx.Response(200, json=[wf("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z", 1)])

    rows = [r for chunk in _client(handler).wind_forecasts(A, B) for r in chunk]
    assert len(rows) == 1 and calls["n"] == 3


def test_client_gives_clear_error_after_retries_exhausted():
    with pytest.raises(UpstreamError):
        list(_client(lambda r: httpx.Response(429, headers={"Retry-After": "0"})).wind_actuals(A, B))


def test_client_does_not_retry_client_errors():
    calls = {"n": 0}

    def handler(req):
        calls["n"] += 1
        return httpx.Response(400)

    with pytest.raises(UpstreamError):
        list(_client(handler).wind_actuals(A, B))
    assert calls["n"] == 1


def test_client_rejects_unexpected_payload_shape():
    with pytest.raises(UpstreamError):
        list(_client(lambda r: httpx.Response(200, json={"oops": 1})).wind_actuals(A, B))


def test_client_requests_wind_only_and_bounded_windows():
    seen = []
    _c = _client(lambda r: (seen.append(dict(r.url.params)), httpx.Response(200, json=[]))[1])
    list(_c.wind_actuals(A, datetime(2026, 1, 20, tzinfo=timezone.utc)))
    assert all(p["fuelType"] == "WIND" for p in seen) and len(seen) == 3  # 19 days / 7-day chunks
