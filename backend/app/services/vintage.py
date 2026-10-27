"""Forecast-vintage selection (no look-ahead).

For delivery interval t and decision cutoff C the eligible forecasts are those with
publish_time <= C (a forecast published exactly AT the cutoff is eligible). Among them the one with
the greatest publish_time is chosen:   f*(t, C) = f(t, p*),  p* = max{ p <= C }.
Intervals with no eligible publication are simply absent from the result (never filled).
"""
from __future__ import annotations

from datetime import date, time

import pandas as pd

from app.utils.timeutil import LONDON, rolling_cutoff_utc, to_local_date


def _latest_per_interval(eligible: pd.DataFrame) -> pd.DataFrame:
    # Sort is deterministic even if upstream dedup were bypassed: ties on publish_time resolve to
    # the larger generation (same rule as normalisation).
    out = (
        eligible.sort_values(["start_time_utc", "publish_time_utc", "generation_mw"])
        .drop_duplicates("start_time_utc", keep="last")
        .sort_values("start_time_utc")
    )
    return out[["start_time_utc", "publish_time_utc", "generation_mw"]].reset_index(drop=True)


def select_vintage(forecasts: pd.DataFrame, cutoff_utc) -> pd.DataFrame:
    """Latest forecast per delivery interval published at or before a single fixed cutoff."""
    cutoff = pd.Timestamp(cutoff_utc)
    return _latest_per_interval(forecasts[forecasts.publish_time_utc <= cutoff])


def select_vintage_rolling(forecasts: pd.DataFrame, days_before: int, local_time: time) -> pd.DataFrame:
    """Per-delivery-day cutoff: 'N days before the delivery date at HH:MM UK local time'.
    Each interval is judged against the cutoff of ITS OWN UK delivery date, so a multi-day
    back-test replays the same decision rule every day."""
    if forecasts.empty:
        return forecasts[["start_time_utc", "publish_time_utc", "generation_mw"]].copy()
    dates = to_local_date(forecasts.start_time_utc)
    cache = {d: pd.Timestamp(rolling_cutoff_utc(d, days_before, local_time)) for d in dates.unique()}
    cutoff = dates.map(cache)
    return _latest_per_interval(forecasts[forecasts.publish_time_utc <= cutoff])


def cutoff_rule_from_cutoff(delivery_date: date, cutoff_utc) -> tuple[int, time]:
    """Express a concrete cutoff as the equivalent rolling rule (days before, UK local clock time)."""
    local = pd.Timestamp(cutoff_utc).tz_convert(LONDON)
    days = max(0, (delivery_date - local.date()).days)
    return days, time(local.hour, local.minute)
