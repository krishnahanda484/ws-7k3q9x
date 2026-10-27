"""Orchestration: combines repository data with vintage selection, metrics and procurement maths.
Route handlers stay thin; all business logic lives in services/."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta

import numpy as np
import pandas as pd

from app.core.config import Settings
from app.core.errors import AppError
from app.data.store import DataRepository
from app.services import metrics as M
from app.services import procurement as P
from app.services import vintage as V
from app.utils.timeutil import LONDON, iso, local_day_bounds_utc, parse_hhmm, rolling_cutoff_utc, to_local_date


def _n(x, nd: int = 2):
    if x is None:
        return None
    if isinstance(x, (float, np.floating)):
        return None if np.isnan(x) else round(float(x), nd)
    return x


def _round_metrics(m: dict) -> dict:
    return {k: (_n(v, 4) if k.endswith("share") else _n(v, 2)) if isinstance(v, (float, np.floating)) else v for k, v in m.items()}


# --- parameter helpers -----------------------------------------------------------
def check_in_window(d: date, s: Settings) -> None:
    if not (s.window_start <= d <= s.window_end):
        raise AppError(422, "outside_data_window",
                       f"{d} is outside the cached evaluation window {s.window_start} to {s.window_end}.")


def default_cutoff(d: date, s: Settings) -> datetime:
    return rolling_cutoff_utc(d, s.default_cutoff_days_before, parse_hhmm(s.default_cutoff_local_time))


def day_window(d: date, period_from: datetime | None, period_to: datetime | None) -> tuple[datetime, datetime]:
    start, end = local_day_bounds_utc(d)
    if period_from is not None:
        start = max(start, period_from)
    if period_to is not None:
        end = min(end, period_to)
    if start >= end:
        raise AppError(422, "invalid_period", "The delivery period is empty or outside the selected delivery date.")
    return start, end


# --- raw series ----------------------------------------------------------------------
def actuals_payload(repo: DataRepository, start: datetime, end: datetime) -> dict:
    a = repo.actuals_between(start, end)
    return {"start": iso(start), "end": iso(end), "count": int(len(a)), "unit": "MW", "kind": "measured",
            "records": [{"start_time_utc": iso(r.start_time_utc), "generation_mw": _n(r.generation_mw)} for r in a.itertuples()]}


def forecasts_payload(repo: DataRepository, start: datetime, end: datetime, cutoff: datetime) -> dict:
    sel = V.select_vintage(repo.forecasts_between(start, end), cutoff)
    return {"start": iso(start), "end": iso(end), "cutoff": iso(cutoff), "count": int(len(sel)), "unit": "MW", "kind": "forecast",
            "records": [{"start_time_utc": iso(r.start_time_utc), "publish_time_utc": iso(r.publish_time_utc),
                         "generation_mw": _n(r.generation_mw)} for r in sel.itertuples()]}


# --- accuracy ---------------------------------------------------------------------------
def accuracy(repo: DataRepository, start_date: date, end_date: date, days_before: int, cutoff_time: time) -> dict:
    start, _ = local_day_bounds_utc(start_date)
    _, end = local_day_bounds_utc(end_date)
    actuals = repo.actuals_between(start, end)
    fc = repo.forecasts_between(start, end)
    sel = V.select_vintage_rolling(fc, days_before, cutoff_time)
    pairs = M.align(actuals, sel)
    overall = M.compute_metrics(pairs)

    local = pairs.start_time_utc.dt.tz_convert(LONDON)
    by_hour = M.group_metrics(pairs, local.dt.hour) if len(pairs) else []
    by_day = M.group_metrics(pairs, local.dt.date) if len(pairs) else []
    pts = [{"t": iso(r.start_time_utc), "actual_mw": _n(r.actual_mw), "forecast_mw": _n(r.forecast_mw),
            "error_mw": _n(r.error_mw), "abs_error_mw": _n(r.abs_error_mw), "publish_time_utc": iso(r.publish_time_utc)}
           for r in pairs.itertuples()]
    return {
        "start_date": start_date.isoformat(), "end_date": end_date.isoformat(),
        "cutoff_rule": {"days_before": days_before, "local_time": cutoff_time.strftime("%H:%M"), "timezone": "Europe/London",
                        "description": f"Each delivery date uses the forecast published at or before {cutoff_time:%H:%M} UK time, {days_before} day(s) earlier."},
        "coverage": {
            "actual_intervals": int(len(actuals)), "forecast_hours_with_eligible_vintage": int(len(sel)),
            "forecast_hours_in_range": int(fc.start_time_utc.nunique()),
            "forecast_hours_without_eligible_vintage": int(fc.start_time_utc.nunique() - len(sel)),
            "paired_intervals": int(len(pairs)),
            "actual_intervals_without_forecast": int(len(actuals) - len(pairs)),
            "note": "WINDFOR is published hourly and FUELHH half-hourly, so pairs exist only at timestamps present in both (on the hour).",
        },
        "metrics": _round_metrics(overall),
        "by_hour": [{"hour": int(r["key"]), **{k: _n(v) for k, v in r.items() if k != "key"}} for r in by_hour],
        "by_day": [{"date": str(r["key"]), **{k: _n(v) for k, v in r.items() if k != "key"}} for r in by_day],
        "error_histogram": M.error_histogram(pairs["error_mw"]) if len(pairs) else [],
        "points": pts,
        "sign_convention": "error = forecast - actual; positive = over-forecast, negative = under-forecast",
    }


# --- single-day profile --------------------------------------------------------------------
def _uncertainty_band(repo: DataRepository, d: date, days_before: int, cutoff_time: time, s: Settings) -> dict | None:
    """Empirical residual band from PRECEDING delivery days only (no look-ahead): quantiles of
    (actual - forecast) under the same cutoff rule. Added to the forecast to bracket a plausible actual."""
    if d <= s.window_start:
        return None
    hist = accuracy(repo, s.window_start, d - timedelta(days=1), days_before, cutoff_time)
    pts = hist["points"]
    if len(pts) < 24:
        return None
    resid = np.array([-p["error_mw"] for p in pts], float)  # actual - forecast
    return {"method": "empirical P10-P90 of (actual - forecast) over preceding delivery days, same cutoff rule",
            "p10_mw": float(np.percentile(resid, 10)), "p90_mw": float(np.percentile(resid, 90)),
            "n": len(pts), "history_start": hist["start_date"], "history_end": hist["end_date"]}


def profile(repo: DataRepository, s: Settings, d: date, cutoff: datetime,
            period_from: datetime | None = None, period_to: datetime | None = None) -> dict:
    check_in_window(d, s)
    start, end = day_window(d, period_from, period_to)
    full_start, full_end = local_day_bounds_utc(d)
    actuals = repo.actuals_between(start, end).set_index("start_time_utc")
    sel = V.select_vintage(repo.forecasts_between(start, end), cutoff).set_index("start_time_utc")
    avail_f = repo.forecasts_between(start, end).start_time_utc.nunique()

    grid = pd.date_range(start, end - pd.Timedelta(minutes=30), freq="30min", tz="UTC")
    pairs = M.align(actuals.reset_index(), sel.reset_index())
    paired_idx = set(pairs.start_time_utc)
    band_info = None
    days_before, ctime = V.cutoff_rule_from_cutoff(d, cutoff)
    band_info = _uncertainty_band(repo, d, days_before, ctime, s)

    points = []
    for t in grid:
        f = sel.generation_mw.get(t)
        a = actuals.generation_mw.get(t)
        pt = {"t": iso(t), "forecast_mw": _n(f), "actual_mw": _n(a),
              "publish_time_utc": iso(sel.publish_time_utc.get(t)) if t in sel.index else None,
              "error_mw": _n(f - a) if t in paired_idx else None, "band_low_mw": None, "band_high_mw": None}
        if band_info and f is not None and not pd.isna(f):
            pt["band_low_mw"] = _n(max(0.0, f + band_info["p10_mw"]))
            pt["band_high_mw"] = _n(f + band_info["p90_mw"])
        points.append(pt)

    m = M.compute_metrics(pairs)
    pubs = sel.publish_time_utc
    pub_counts = pubs.value_counts().sort_index() if len(sel) else pd.Series(dtype=int)
    n_act = int(len(actuals))
    mode = "prospective" if n_act == 0 else ("retrospective" if n_act >= len(grid) else "partial")

    # Historical reliability under the same decision rule, using only days BEFORE the delivery date.
    hist = None
    if d > s.window_start:
        h = accuracy(repo, s.window_start, d - timedelta(days=1), days_before, ctime)
        hist = {"start_date": h["start_date"], "end_date": h["end_date"], "metrics": h["metrics"]}

    fmean = _n(sel.generation_mw.mean()) if len(sel) else None
    insight = _insight(d, fmean, hist, m, mode, cutoff)
    return {
        "delivery_date": d.isoformat(), "timezone": "Europe/London",
        "window_start": iso(start), "window_end": iso(end),
        "cutoff": iso(cutoff), "cutoff_local": cutoff.astimezone(LONDON).strftime("%Y-%m-%d %H:%M %Z"),
        "mode": mode,
        "forecast": {
            "intervals": int(len(sel)), "intervals_expected": int(len(grid) // 2),
            "intervals_missing": int(len(grid) // 2 - len(sel)),
            "intervals_published_after_cutoff_only": int(avail_f - len(sel)),
            "mean_mw": fmean, "min_mw": _n(sel.generation_mw.min()) if len(sel) else None,
            "max_mw": _n(sel.generation_mw.max()) if len(sel) else None,
            "latest_publish_time_utc": iso(pubs.max()) if len(sel) else None,
            "earliest_publish_time_utc": iso(pubs.min()) if len(sel) else None,
            "publications_used": [{"publish_time_utc": iso(k), "intervals": int(v)} for k, v in pub_counts.items()],
        },
        "actual": {"intervals": n_act, "mean_mw": _n(actuals.generation_mw.mean()) if n_act else None},
        "metrics_selected_period": _round_metrics(m),
        "history": hist,
        "uncertainty_band": band_info,
        "points": points,
        "insight": insight,
    }


def _insight(d: date, fmean, hist, m, mode, cutoff) -> str:
    if fmean is None:
        return (f"No forecast published at or before the selected cutoff covers {d:%d %b %Y}. "
                "Nothing is inferred or filled in; choose a later cutoff.")
    parts = [f"The latest forecast available at the cutoff averages {fmean:,.0f} MW of wind over the selected delivery period."]
    hm = hist["metrics"] if hist else None
    if hm and hm["n"]:
        parts.append(f"Under the same cutoff rule, forecasts for {hist['start_date']} to {hist['end_date']} had an MAE of "
                     f"{hm['mae_mw']:,.0f} MW and bias of {hm['bias_mw']:+,.0f} MW (n={hm['n']} hourly pairs); "
                     "this indicates the scale of typical deviation, not a guaranteed procurement requirement.")
    else:
        parts.append("No earlier delivery days exist in the cached window, so no prior-day accuracy history is available.")
    if mode != "prospective" and m["n"]:
        parts.append(f"In hindsight, this day's forecast MAE was {m['mae_mw']:,.0f} MW with bias {m['bias_mw']:+,.0f} MW "
                     f"({'over' if m['bias_mw'] > 0 else 'under'}-forecast on average; n={m['n']}).")
    return " ".join(parts)


# --- vintages ------------------------------------------------------------------------------------
def vintages(repo: DataRepository, s: Settings, d: date, cutoff: datetime) -> dict:
    check_in_window(d, s)
    start, end = local_day_bounds_utc(d)
    fc = repo.forecasts_between(start, end)
    actuals = repo.actuals_between(start, end)
    sel = V.select_vintage(fc, cutoff)
    sel_count = sel.publish_time_utc.value_counts()
    cut = pd.Timestamp(cutoff)
    out = []
    for pub, g in fc.groupby("publish_time_utc", sort=True):
        pr = M.align(actuals, g)
        out.append({
            "publish_time_utc": iso(pub), "eligible": bool(pub <= cut),
            "lead_hours_before_day_start": _n((start - pub).total_seconds() / 3600, 1),
            "intervals": int(len(g)), "mean_mw": _n(g.generation_mw.mean()),
            "selected_intervals": int(sel_count.get(pub, 0)),
            "mae_mw": _n(pr.abs_error_mw.mean()) if len(pr) else None, "paired_n": int(len(pr)),
            "series": [{"t": iso(r.start_time_utc), "mw": _n(r.generation_mw)} for r in g.itertuples()],
        })
    later = [v for v in out if not v["eligible"]]
    return {
        "delivery_date": d.isoformat(), "cutoff": iso(cutoff), "total_publications": len(out),
        "eligible_publications": len(out) - len(later),
        "vintages": out,
        "selected_series": [{"t": iso(r.start_time_utc), "mw": _n(r.generation_mw), "publish_time_utc": iso(r.publish_time_utc)} for r in sel.itertuples()],
        "explanation": ("For each hour the forecast with the greatest publish time at or before the cutoff is used. "
                        "WINDFOR publications cover a rolling horizon, so a publication made before the cutoff may not yet "
                        "include later hours of the day; those hours fall back to an earlier eligible publication "
                        "(or have none, and stay empty)."),
    }


# --- procurement sensitivity ---------------------------------------------------------------------------
def procurement_sensitivity(repo: DataRepository, s: Settings, d: date, cutoff: datetime, demand_mw: float,
                            period_from: datetime | None = None, period_to: datetime | None = None) -> dict:
    prof = profile(repo, s, d, cutoff, period_from, period_to)
    rows, abs_e = [], []
    for p in prof["points"]:
        if p["forecast_mw"] is None and p["actual_mw"] is None:
            continue
        r = P.residual_error(demand_mw, p["forecast_mw"], p["actual_mw"])
        both = p["error_mw"] is not None
        rows.append({"t": p["t"], "forecast_mw": p["forecast_mw"], "actual_mw": p["actual_mw"],
                     **{k: _n(v) for k, v in r.items()},
                     "wind_error_mw": p["error_mw"]})
        if both and r["residual_error_mw"] is not None:
            abs_e.append(abs(r["residual_error_mw"]))
    fr = [x["forecast_residual_mw"] for x in rows if x["forecast_residual_mw"] is not None]
    paired = [x for x in rows if x["residual_error_mw"] is not None]
    pr_hat = [x["forecast_residual_mw"] for x in paired]
    pr = [x["actual_residual_mw"] for x in paired]
    er = [x["residual_error_mw"] for x in paired]
    wind_surplus_share = (sum(1 for x in paired if x["actual_residual_mw"] == 0 and x["forecast_residual_mw"] == 0) / len(paired)) if paired else None
    return {
        "delivery_date": d.isoformat(), "cutoff": prof["cutoff"], "mode": prof["mode"], "demand_mw": demand_mw,
        "label": "ILLUSTRATIVE - demand is user-supplied; wind is the only supply modelled. Not a procurement recommendation.",
        "summary": {
            "forecast_residual_mean_mw": _n(float(np.mean(fr))) if fr else None,
            "forecast_residual_peak_mw": _n(max(fr)) if fr else None,
            "paired_intervals": len(paired),
            "paired_forecast_residual_mean_mw": _n(float(np.mean(pr_hat))) if paired else None,
            "paired_actual_residual_mean_mw": _n(float(np.mean(pr))) if paired else None,
            "residual_error_mean_mw": _n(float(np.mean(er))) if paired else None,
            "residual_error_mean_abs_mw": _n(float(np.mean(np.abs(er)))) if paired else None,
            "residual_error_max_abs_mw": _n(float(np.max(np.abs(er)))) if paired else None,
            "share_intervals_wind_covers_demand_both": _n(wind_surplus_share, 4),
            "wind_mae_mw": prof["metrics_selected_period"]["mae_mw"],
        },
        "points": rows,
    }
