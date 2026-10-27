from datetime import time

import pandas as pd

from app.services.vintage import cutoff_rule_from_cutoff, select_vintage, select_vintage_rolling
from tests.conftest import fc_df, ts


def test_picks_latest_published_at_or_before_cutoff():
    df = fc_df([("2026-01-02 10:00", "2026-01-01 06:00", 100), ("2026-01-02 10:00", "2026-01-01 09:00", 200),
                ("2026-01-02 10:00", "2026-01-01 15:00", 300)])
    out = select_vintage(df, ts("2026-01-01 12:00"))
    assert out.generation_mw.tolist() == [200]
    assert out.publish_time_utc.iloc[0] == ts("2026-01-01 09:00")


def test_forecast_published_exactly_at_cutoff_is_eligible():
    df = fc_df([("2026-01-02 10:00", "2026-01-01 06:00", 100), ("2026-01-02 10:00", "2026-01-01 09:00", 200)])
    assert select_vintage(df, ts("2026-01-01 09:00")).generation_mw.tolist() == [200]


def test_never_uses_forecast_after_cutoff():
    df = fc_df([("2026-01-02 10:00", "2026-01-01 09:00:01", 999)])
    assert select_vintage(df, ts("2026-01-01 09:00")).empty


def test_no_eligible_forecast_leaves_interval_missing_not_filled():
    df = fc_df([("2026-01-02 10:00", "2026-01-01 06:00", 100), ("2026-01-02 11:00", "2026-01-01 10:00", 150)])
    out = select_vintage(df, ts("2026-01-01 08:00"))
    assert out.start_time_utc.tolist() == [ts("2026-01-02 10:00")]


def test_latest_vintage_can_differ_across_intervals():
    df = fc_df([("2026-01-02 10:00", "2026-01-01 06:00", 1), ("2026-01-02 10:00", "2026-01-01 09:00", 2),
                ("2026-01-02 11:00", "2026-01-01 06:00", 3)])
    out = select_vintage(df, ts("2026-01-01 10:00"))
    assert out.publish_time_utc.tolist() == [ts("2026-01-01 09:00"), ts("2026-01-01 06:00")]


def test_tie_on_publish_time_is_deterministic():
    df = fc_df([("2026-01-02 10:00", "2026-01-01 06:00", 100), ("2026-01-02 10:00", "2026-01-01 06:00", 120)])
    first = select_vintage(df, ts("2026-01-01 12:00")).generation_mw.tolist()
    second = select_vintage(df.iloc[::-1], ts("2026-01-01 12:00")).generation_mw.tolist()
    assert first == second == [120]


def test_empty_input():
    assert select_vintage(fc_df([]), ts("2026-01-01")).empty


def test_rolling_rule_applies_each_days_own_cutoff():
    df = fc_df([
        ("2026-01-02 10:00", "2026-01-01 08:00", 1), ("2026-01-02 10:00", "2026-01-01 10:00", 2),
        ("2026-01-03 10:00", "2026-01-02 08:00", 3), ("2026-01-03 10:00", "2026-01-02 10:00", 4),
    ])
    out = select_vintage_rolling(df, 1, time(9, 0))  # D-1 09:00
    assert out.generation_mw.tolist() == [1, 3]


def test_cutoff_rule_from_cutoff():
    from datetime import date
    assert cutoff_rule_from_cutoff(date(2026, 1, 15), pd.Timestamp("2026-01-14T09:00Z")) == (1, time(9, 0))
