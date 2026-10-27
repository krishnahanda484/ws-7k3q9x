"""REST routes. Handlers only parse/validate parameters and delegate to services."""
from __future__ import annotations

from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.core.config import Settings, get_settings
from app.core.errors import AppError, DataUnavailableError
from app.data.store import DataRepository
from app.models import api as m
from app.services import analysis as A
from app.utils.timeutil import iso, local_day_bounds_utc, parse_hhmm, parse_instant

router = APIRouter(prefix="/api")


def get_repo(request: Request) -> DataRepository:
    repo = getattr(request.app.state, "repo", None)
    if repo is None:
        raise DataUnavailableError(
            getattr(request.app.state, "repo_error", "Data not loaded.")
        )
    return repo


Repo = Annotated[DataRepository, Depends(get_repo)]
Cfg = Annotated[Settings, Depends(get_settings)]


def _instant(name: str, value: str | None, required: bool = False) -> datetime | None:
    if value is None:
        if required:
            raise AppError(422, "invalid_parameters", f"'{name}' is required.")
        return None
    try:
        return parse_instant(value)
    except ValueError as exc:
        raise AppError(422, "invalid_parameters", f"{name}: {exc}") from exc


def _hhmm(value: str):
    try:
        return parse_hhmm(value)
    except ValueError as exc:
        raise AppError(422, "invalid_parameters", f"cutoff_time: {exc}") from exc


@router.get("/health", response_model=m.Health, tags=["system"])
def health(request: Request):
    repo = getattr(request.app.state, "repo", None)
    if repo is None:
        return m.Health(status="degraded", data_loaded=False, detail=getattr(request.app.state, "repo_error", None))
    return m.Health(status="ok", data_loaded=True, data_mode=repo.data_mode)


@router.get("/metadata", response_model=m.Metadata, tags=["system"])
def metadata(repo: Repo, cfg: Cfg):
    mf = repo.manifest
    return m.Metadata(
        product="WindSight - UK Wind Forecast Intelligence",
        data_mode=mf.get("data_mode", "unknown"),
        data_description=mf.get("description", ""),
        extracted_at_utc=mf.get("extracted_at_utc", ""),
        window_start_date=mf.get("window_start_date", cfg.window_start.isoformat()),
        window_end_date=mf.get("window_end_date", cfg.window_end.isoformat()),
        sources=mf.get("sources", {}), units=mf.get("units", "MW"), licence=mf.get("licence", ""),
        actual_intervals=int(len(repo.actuals)),
        forecast_rows=int(len(repo.forecasts)),
        forecast_publications=int(repo.forecasts.publish_time_utc.nunique()),
        latest_actual_start_utc=iso(repo.actuals.start_time_utc.max()),
        latest_forecast_publish_utc=iso(repo.forecasts.publish_time_utc.max()),
        quality=mf.get("quality", {}),
        defaults={"cutoff_days_before": cfg.default_cutoff_days_before, "cutoff_local_time": cfg.default_cutoff_local_time,
                  "default_delivery_date": "2026-01-15"},
    )


@router.get("/actuals", response_model=m.ActualsResponse, tags=["data"])
def actuals(repo: Repo, start: str, end: str):
    s, e = _instant("start", start, True), _instant("end", end, True)
    if s >= e:
        raise AppError(422, "invalid_parameters", "'start' must be before 'end'.")
    return A.actuals_payload(repo, s, e)


@router.get("/forecasts", response_model=m.ForecastsResponse, tags=["data"])
def forecasts(repo: Repo, start: str, end: str, cutoff: str):
    s, e, c = _instant("start", start, True), _instant("end", end, True), _instant("cutoff", cutoff, True)
    if s >= e:
        raise AppError(422, "invalid_parameters", "'start' must be before 'end'.")
    return A.forecasts_payload(repo, s, e, c)


def _cutoff_or_default(cutoff: str | None, d: date, cfg: Settings) -> datetime:
    return _instant("cutoff", cutoff) or A.default_cutoff(d, cfg)


@router.get("/analysis/profile", response_model=m.ProfileResponse, tags=["analysis"])
def profile(repo: Repo, cfg: Cfg, date: date, cutoff: str | None = None,
            period_from: str | None = None, period_to: str | None = None):
    return A.profile(repo, cfg, date, _cutoff_or_default(cutoff, date, cfg),
                     _instant("period_from", period_from), _instant("period_to", period_to))


@router.get("/analysis/vintages", response_model=m.VintagesResponse, tags=["analysis"])
def vintages(repo: Repo, cfg: Cfg, date: date, cutoff: str | None = None):
    return A.vintages(repo, cfg, date, _cutoff_or_default(cutoff, date, cfg))


@router.get("/analysis/accuracy", response_model=m.AccuracyResponse, tags=["analysis"])
def accuracy(repo: Repo, cfg: Cfg, start: date, end: date,
             cutoff_days_before: Annotated[int, Query(ge=0, le=14)] = 1,
             cutoff_time: str = "09:00"):
    if start > end:
        raise AppError(422, "invalid_parameters", "'start' must not be after 'end'.")
    A.check_in_window(start, cfg)
    A.check_in_window(end, cfg)
    return A.accuracy(repo, start, end, cutoff_days_before, _hhmm(cutoff_time))


@router.get("/analysis/procurement-sensitivity", response_model=m.ProcurementResponse, tags=["analysis"])
def procurement(repo: Repo, cfg: Cfg, date: date, demand_mw: Annotated[float, Query(ge=0, le=100000)],
                cutoff: str | None = None, period_from: str | None = None, period_to: str | None = None):
    return A.procurement_sensitivity(repo, cfg, date, _cutoff_or_default(cutoff, date, cfg), demand_mw,
                                     _instant("period_from", period_from), _instant("period_to", period_to))
