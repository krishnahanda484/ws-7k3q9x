"""Response models for the public REST API (drive the OpenAPI docs and validate output)."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel


class Health(BaseModel):
    status: Literal["ok", "degraded"]
    data_loaded: bool
    data_mode: str | None = None
    detail: str | None = None


class Metadata(BaseModel):
    product: str
    data_mode: str
    data_description: str
    extracted_at_utc: str
    window_start_date: str
    window_end_date: str
    sources: dict[str, str]
    units: str
    licence: str
    actual_intervals: int
    forecast_rows: int
    forecast_publications: int
    latest_actual_start_utc: str | None
    latest_forecast_publish_utc: str | None
    quality: dict[str, Any]
    defaults: dict[str, Any]
    timezone: str = "Europe/London"


class ActualRecord(BaseModel):
    start_time_utc: str
    generation_mw: float | None


class ActualsResponse(BaseModel):
    start: str
    end: str
    count: int
    unit: str
    kind: str
    records: list[ActualRecord]


class ForecastRecord(BaseModel):
    start_time_utc: str
    publish_time_utc: str
    generation_mw: float | None


class ForecastsResponse(BaseModel):
    start: str
    end: str
    cutoff: str
    count: int
    unit: str
    kind: str
    records: list[ForecastRecord]


class Metrics(BaseModel):
    n: int
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    mape_pct: float | None
    mape_n: int
    mape_excluded_zero_actuals: int
    mean_actual_mw: float | None
    mean_forecast_mw: float | None
    nmae_pct_of_mean_actual: float | None
    overforecast_count: int
    underforecast_count: int
    exact_count: int
    overforecast_share: float | None
    underforecast_share: float | None
    abs_error_p50_mw: float | None
    abs_error_p90_mw: float | None
    abs_error_p95_mw: float | None
    max_abs_error_mw: float | None
    total_signed_error_mwh_assuming_half_hour: float | None


class GroupMetric(BaseModel):
    hour: int | None = None
    date: str | None = None
    n: int
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    mean_actual_mw: float | None
    mean_forecast_mw: float | None


class HistBin(BaseModel):
    bin_start_mw: float
    bin_end_mw: float
    count: int


class AccuracyPoint(BaseModel):
    t: str
    actual_mw: float
    forecast_mw: float
    error_mw: float
    abs_error_mw: float
    publish_time_utc: str


class AccuracyResponse(BaseModel):
    start_date: str
    end_date: str
    cutoff_rule: dict[str, Any]
    coverage: dict[str, Any]
    metrics: Metrics
    by_hour: list[GroupMetric]
    by_day: list[GroupMetric]
    error_histogram: list[HistBin]
    points: list[AccuracyPoint]
    sign_convention: str


class ProfilePoint(BaseModel):
    t: str
    forecast_mw: float | None
    actual_mw: float | None
    publish_time_utc: str | None
    error_mw: float | None
    band_low_mw: float | None
    band_high_mw: float | None


class ProfileResponse(BaseModel):
    delivery_date: str
    timezone: str
    window_start: str
    window_end: str
    cutoff: str
    cutoff_local: str
    mode: Literal["prospective", "retrospective", "partial"]
    forecast: dict[str, Any]
    actual: dict[str, Any]
    metrics_selected_period: Metrics
    history: dict[str, Any] | None
    uncertainty_band: dict[str, Any] | None
    points: list[ProfilePoint]
    insight: str


class Vintage(BaseModel):
    publish_time_utc: str
    eligible: bool
    lead_hours_before_day_start: float | None
    intervals: int
    mean_mw: float | None
    selected_intervals: int
    mae_mw: float | None
    paired_n: int
    series: list[dict[str, Any]]


class VintagesResponse(BaseModel):
    delivery_date: str
    cutoff: str
    total_publications: int
    eligible_publications: int
    vintages: list[Vintage]
    selected_series: list[dict[str, Any]]
    explanation: str


class ProcurementPoint(BaseModel):
    t: str
    forecast_mw: float | None
    actual_mw: float | None
    forecast_residual_mw: float | None
    actual_residual_mw: float | None
    residual_error_mw: float | None
    wind_error_mw: float | None


class ProcurementResponse(BaseModel):
    delivery_date: str
    cutoff: str
    mode: str
    demand_mw: float
    label: str
    summary: dict[str, Any]
    points: list[ProcurementPoint]
