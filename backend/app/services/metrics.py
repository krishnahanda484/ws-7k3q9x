"""Forecast-accuracy maths.  Sign convention: error = forecast - actual, so
positive bias = OVER-forecast, negative bias = UNDER-forecast."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

HALF_HOUR = 0.5  # hours; used only where a MW average is converted to MWh (see METHODOLOGY.md)


def align(actuals: pd.DataFrame, forecasts: pd.DataFrame) -> pd.DataFrame:
    """Inner-join actuals and the selected forecast on the exact delivery start time.

    Only intervals present in BOTH sides (and non-null) are paired; there is no interpolation,
    no zero-filling and no nearest-neighbour matching. WINDFOR is hourly, so the :30 half-hours of
    FUELHH have no forecast and are (deliberately) left unpaired."""
    a = actuals[["start_time_utc", "generation_mw"]].rename(columns={"generation_mw": "actual_mw"})
    f = forecasts[["start_time_utc", "publish_time_utc", "generation_mw"]].rename(
        columns={"generation_mw": "forecast_mw"}
    )
    p = a.drop_duplicates("start_time_utc").merge(f.drop_duplicates("start_time_utc"), on="start_time_utc", how="inner")
    p = p.dropna(subset=["actual_mw", "forecast_mw"]).sort_values("start_time_utc").reset_index(drop=True)
    p["error_mw"] = p["forecast_mw"] - p["actual_mw"]
    p["abs_error_mw"] = p["error_mw"].abs()
    return p


def _f(x) -> float | None:
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else float(x)


def compute_metrics(pairs: pd.DataFrame) -> dict:
    n = int(len(pairs))
    empty = {
        "n": 0, "mae_mw": None, "rmse_mw": None, "bias_mw": None, "mape_pct": None, "mape_n": 0,
        "mape_excluded_zero_actuals": 0, "mean_actual_mw": None, "mean_forecast_mw": None,
        "nmae_pct_of_mean_actual": None, "overforecast_count": 0, "underforecast_count": 0,
        "exact_count": 0, "overforecast_share": None, "underforecast_share": None,
        "abs_error_p50_mw": None, "abs_error_p90_mw": None, "abs_error_p95_mw": None,
        "max_abs_error_mw": None, "total_signed_error_mwh_assuming_half_hour": None,
    }
    if n == 0:
        return empty
    y = pairs["actual_mw"].to_numpy(float)
    yh = pairs["forecast_mw"].to_numpy(float)
    e = yh - y
    ae = np.abs(e)
    nz = y != 0  # MAPE is undefined at zero actuals; those intervals are excluded and counted
    mape_n = int(nz.sum())
    mape = float(np.mean(np.abs(e[nz] / y[nz])) * 100) if mape_n else None
    over, under = int((e > 0).sum()), int((e < 0).sum())
    mean_a = float(y.mean())
    return {
        "n": n,
        "mae_mw": float(ae.mean()),
        "rmse_mw": float(np.sqrt(np.mean(e**2))),
        "bias_mw": float(e.mean()),
        "mape_pct": mape,
        "mape_n": mape_n,
        "mape_excluded_zero_actuals": int(n - mape_n),
        "mean_actual_mw": mean_a,
        "mean_forecast_mw": float(yh.mean()),
        "nmae_pct_of_mean_actual": float(ae.mean() / mean_a * 100) if mean_a else None,
        "overforecast_count": over,
        "underforecast_count": under,
        "exact_count": int(n - over - under),
        "overforecast_share": over / n,
        "underforecast_share": under / n,
        "abs_error_p50_mw": float(np.percentile(ae, 50)),
        "abs_error_p90_mw": float(np.percentile(ae, 90)),
        "abs_error_p95_mw": float(np.percentile(ae, 95)),
        "max_abs_error_mw": float(ae.max()),
        # MW average over a half hour * 0.5 h = MWh (assumption: each paired MW value is a 30-min average)
        "total_signed_error_mwh_assuming_half_hour": float(e.sum() * HALF_HOUR),
    }


def group_metrics(pairs: pd.DataFrame, key: pd.Series) -> list[dict]:
    rows = []
    for k, g in pairs.groupby(key, sort=True):
        m = compute_metrics(g)
        rows.append({"key": k, "n": m["n"], "mae_mw": m["mae_mw"], "rmse_mw": m["rmse_mw"], "bias_mw": m["bias_mw"],
                     "mean_actual_mw": m["mean_actual_mw"], "mean_forecast_mw": m["mean_forecast_mw"]})
    return rows


def error_histogram(errors: pd.Series, bin_width: float = 1000.0) -> list[dict]:
    if errors.empty:
        return []
    lo = math.floor(errors.min() / bin_width) * bin_width
    hi = math.ceil((errors.max() + 1e-9) / bin_width) * bin_width
    edges = np.arange(lo, hi + bin_width, bin_width)
    counts, edges = np.histogram(errors.to_numpy(float), bins=edges)
    return [
        {"bin_start_mw": float(edges[i]), "bin_end_mw": float(edges[i + 1]), "count": int(c)}
        for i, c in enumerate(counts)
    ]
