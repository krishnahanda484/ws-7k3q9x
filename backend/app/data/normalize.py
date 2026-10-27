"""Raw Elexon rows -> clean internal DataFrames + a data-quality report.

Internal schemas
  actuals:   start_time_utc, generation_mw, fuel_type, source
  forecasts: start_time_utc, publish_time_utc, generation_mw, source

Dedup policy (deterministic):
  actuals   - key = start_time_utc. If several rows share a key, keep the one with the latest
              publishTime (a revision supersedes), ties broken by the greater generation.
  forecasts - key = (start_time_utc, publish_time_utc). Exact duplicates collapse; if the same
              key carries conflicting values, keep the greater generation. Both cases are counted.
Missing (null / non-numeric) generation rows are DROPPED from the cache, never zero-filled; they
are counted in the quality report. All timestamps are tz-aware UTC.
"""
from __future__ import annotations

from typing import Iterable

import pandas as pd
from pydantic import ValidationError

from app.models.elexon import FuelHHRow, WindForRow

ACTUAL_SOURCE = "elexon:FUELHH"
FORECAST_SOURCE = "elexon:WINDFOR"

ACTUAL_COLS = ["start_time_utc", "generation_mw", "fuel_type", "source"]
FORECAST_COLS = ["start_time_utc", "publish_time_utc", "generation_mw", "source"]


def _empty(cols: list[str]) -> pd.DataFrame:
    df = pd.DataFrame({c: [] for c in cols})
    for c in cols:
        if c.endswith("_utc"):
            df[c] = pd.to_datetime(df[c], utc=True)
    return df


def normalize_actuals(rows: Iterable[dict]) -> tuple[pd.DataFrame, dict]:
    q = {"raw_rows": 0, "invalid_rows": 0, "non_wind_rows_dropped": 0, "missing_generation_dropped": 0,
         "duplicate_rows_collapsed": 0}
    recs = []
    for r in rows:
        q["raw_rows"] += 1
        try:
            m = FuelHHRow.model_validate(r)
        except ValidationError:
            q["invalid_rows"] += 1
            continue
        if m.fuelType != "WIND":  # the only fuel type in scope
            q["non_wind_rows_dropped"] += 1
            continue
        if m.generation is None:
            q["missing_generation_dropped"] += 1
            continue
        recs.append((m.startTime, m.publishTime, m.generation))
    if not recs:
        return _empty(ACTUAL_COLS), q
    df = pd.DataFrame(recs, columns=["start_time_utc", "publish", "generation_mw"])
    df["start_time_utc"] = pd.to_datetime(df["start_time_utc"], utc=True)
    df["publish"] = pd.to_datetime(df["publish"], utc=True)
    before = len(df)
    df = df.sort_values(["start_time_utc", "publish", "generation_mw"]).drop_duplicates("start_time_utc", keep="last")
    q["duplicate_rows_collapsed"] = before - len(df)
    df = df.drop(columns="publish").reset_index(drop=True)
    df["fuel_type"] = "WIND"
    df["source"] = ACTUAL_SOURCE
    return df[ACTUAL_COLS], q


def normalize_forecasts(rows: Iterable[dict]) -> tuple[pd.DataFrame, dict]:
    q = {"raw_rows": 0, "invalid_rows": 0, "missing_generation_dropped": 0, "duplicate_rows_collapsed": 0,
         "conflicting_duplicates": 0}
    recs = []
    for r in rows:
        q["raw_rows"] += 1
        try:
            m = WindForRow.model_validate(r)
        except ValidationError:
            q["invalid_rows"] += 1
            continue
        if m.generation is None:
            q["missing_generation_dropped"] += 1
            continue
        recs.append((m.startTime, m.publishTime, m.generation))
    if not recs:
        return _empty(FORECAST_COLS), q
    df = pd.DataFrame(recs, columns=["start_time_utc", "publish_time_utc", "generation_mw"])
    df["start_time_utc"] = pd.to_datetime(df["start_time_utc"], utc=True)
    df["publish_time_utc"] = pd.to_datetime(df["publish_time_utc"], utc=True)
    key = ["start_time_utc", "publish_time_utc"]
    before = len(df)
    exact = df.duplicated(keep="first").sum()
    df = df.drop_duplicates()
    q["conflicting_duplicates"] = int(df.duplicated(key).sum())
    df = df.sort_values(key + ["generation_mw"]).drop_duplicates(key, keep="last")
    q["duplicate_rows_collapsed"] = before - len(df)
    q["exact_duplicates"] = int(exact)
    df = df.reset_index(drop=True)
    df["source"] = FORECAST_SOURCE
    return df[FORECAST_COLS], q


def quality_checks(actuals: pd.DataFrame, forecasts: pd.DataFrame) -> dict:
    """Post-normalisation checks on the cached extract."""
    out: dict = {}
    if len(actuals):
        out["actual_intervals"] = int(len(actuals))
        out["actual_min_mw"] = float(actuals.generation_mw.min())
        out["actual_max_mw"] = float(actuals.generation_mw.max())
        out["actual_negative_values"] = int((actuals.generation_mw < 0).sum())
        s = actuals.start_time_utc.sort_values()
        full = pd.date_range(s.iloc[0], s.iloc[-1], freq="30min")
        out["actual_missing_half_hours"] = int(len(full.difference(pd.DatetimeIndex(s))))
    if len(forecasts):
        out["forecast_rows"] = int(len(forecasts))
        out["forecast_publications"] = int(forecasts.publish_time_utc.nunique())
        out["forecast_delivery_hours"] = int(forecasts.start_time_utc.nunique())
        out["forecast_negative_values"] = int((forecasts.generation_mw < 0).sum())
        out["forecast_non_hourly_starts"] = int((forecasts.start_time_utc.dt.minute != 0).sum())
        per = forecasts.groupby("start_time_utc").size()
        out["vintages_per_delivery_hour_min"] = int(per.min())
        out["vintages_per_delivery_hour_max"] = int(per.max())
    return out
