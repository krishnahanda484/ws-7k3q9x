"""Time helpers. Everything is stored/compared in UTC; Europe/London is for display
and for defining what "a delivery day" means."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import pandas as pd

LONDON = ZoneInfo("Europe/London")
UTC = timezone.utc


def parse_instant(value: str | datetime) -> datetime:
    """Parse an ISO-8601 instant. A zone offset (or Z) is mandatory so a cutoff is never ambiguous."""
    if isinstance(value, str):
        v = value.strip().replace("Z", "+00:00").replace("z", "+00:00")
        try:
            dt = datetime.fromisoformat(v)
        except ValueError as exc:
            raise ValueError(f"'{value}' is not a valid ISO-8601 datetime") from exc
    else:
        dt = value
    if dt.tzinfo is None:
        raise ValueError(f"'{value}' has no time-zone offset; use e.g. 2026-01-14T09:00:00Z")
    return dt.astimezone(UTC)


def parse_hhmm(value: str) -> time:
    try:
        hh, mm = value.split(":")
        return time(int(hh), int(mm))
    except Exception as exc:
        raise ValueError(f"'{value}' is not HH:MM") from exc


def local_day_bounds_utc(d: date) -> tuple[datetime, datetime]:
    """UTC [start, end) of a UK-local calendar day (23/24/25 h depending on DST)."""
    start = datetime.combine(d, time(0, 0), tzinfo=LONDON).astimezone(UTC)
    end = datetime.combine(d + timedelta(days=1), time(0, 0), tzinfo=LONDON).astimezone(UTC)
    return start, end


def rolling_cutoff_utc(delivery_date: date, days_before: int, local_time: time) -> datetime:
    """Cutoff for a delivery date under the rule 'N days before, at HH:MM UK local time'."""
    d = delivery_date - timedelta(days=days_before)
    return datetime.combine(d, local_time, tzinfo=LONDON).astimezone(UTC)


def to_local_date(ts: pd.Series) -> pd.Series:
    """UTC timestamp series -> UK-local calendar date series."""
    return ts.dt.tz_convert(LONDON).dt.date


def iso(ts) -> str | None:
    if ts is None or pd.isna(ts):
        return None
    return pd.Timestamp(ts).tz_convert("UTC").strftime("%Y-%m-%dT%H:%M:%SZ")
