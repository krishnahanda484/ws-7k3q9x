// Mirrors backend/app/models/api.py

export interface Health {
  status: 'ok' | 'degraded'
  data_loaded: boolean
  data_mode: string | null
  detail: string | null
}

export interface Metadata {
  product: string
  data_mode: string
  data_description: string
  extracted_at_utc: string
  window_start_date: string
  window_end_date: string
  sources: Record<string, string>
  units: string
  licence: string
  actual_intervals: number
  forecast_rows: number
  forecast_publications: number
  latest_actual_start_utc: string | null
  latest_forecast_publish_utc: string | null
  quality: Record<string, number | Record<string, number>>
  defaults: { cutoff_days_before: number; cutoff_local_time: string; default_delivery_date: string }
  timezone: string
}

export interface Metrics {
  n: number
  mae_mw: number | null
  rmse_mw: number | null
  bias_mw: number | null
  mape_pct: number | null
  mape_n: number
  mape_excluded_zero_actuals: number
  mean_actual_mw: number | null
  mean_forecast_mw: number | null
  nmae_pct_of_mean_actual: number | null
  overforecast_count: number
  underforecast_count: number
  exact_count: number
  overforecast_share: number | null
  underforecast_share: number | null
  abs_error_p50_mw: number | null
  abs_error_p90_mw: number | null
  abs_error_p95_mw: number | null
  max_abs_error_mw: number | null
  total_signed_error_mwh_assuming_half_hour: number | null
}

export interface ProfilePoint {
  t: string
  forecast_mw: number | null
  actual_mw: number | null
  publish_time_utc: string | null
  error_mw: number | null
  band_low_mw: number | null
  band_high_mw: number | null
}

export interface ProfileResponse {
  delivery_date: string
  timezone: string
  window_start: string
  window_end: string
  cutoff: string
  cutoff_local: string
  mode: 'prospective' | 'retrospective' | 'partial'
  forecast: {
    intervals: number
    intervals_expected: number
    intervals_missing: number
    intervals_published_after_cutoff_only: number
    mean_mw: number | null
    min_mw: number | null
    max_mw: number | null
    latest_publish_time_utc: string | null
    earliest_publish_time_utc: string | null
    publications_used: { publish_time_utc: string; intervals: number }[]
  }
  actual: { intervals: number; mean_mw: number | null }
  metrics_selected_period: Metrics
  history: { start_date: string; end_date: string; metrics: Metrics } | null
  uncertainty_band: { method: string; p10_mw: number; p90_mw: number; n: number; history_start: string; history_end: string } | null
  points: ProfilePoint[]
  insight: string
}

export interface VintageSeriesPoint { t: string; mw: number | null }
export interface Vintage {
  publish_time_utc: string
  eligible: boolean
  lead_hours_before_day_start: number | null
  intervals: number
  mean_mw: number | null
  selected_intervals: number
  mae_mw: number | null
  paired_n: number
  series: VintageSeriesPoint[]
}
export interface VintagesResponse {
  delivery_date: string
  cutoff: string
  total_publications: number
  eligible_publications: number
  vintages: Vintage[]
  selected_series: (VintageSeriesPoint & { publish_time_utc: string })[]
  explanation: string
}

export interface GroupMetric {
  hour: number | null
  date: string | null
  n: number
  mae_mw: number | null
  rmse_mw: number | null
  bias_mw: number | null
  mean_actual_mw: number | null
  mean_forecast_mw: number | null
}

export interface AccuracyPoint {
  t: string
  actual_mw: number
  forecast_mw: number
  error_mw: number
  abs_error_mw: number
  publish_time_utc: string
}

export interface AccuracyResponse {
  start_date: string
  end_date: string
  cutoff_rule: { days_before: number; local_time: string; timezone: string; description: string }
  coverage: Record<string, number | string>
  metrics: Metrics
  by_hour: GroupMetric[]
  by_day: GroupMetric[]
  error_histogram: { bin_start_mw: number; bin_end_mw: number; count: number }[]
  points: AccuracyPoint[]
  sign_convention: string
}

export interface ProcurementPoint {
  t: string
  forecast_mw: number | null
  actual_mw: number | null
  forecast_residual_mw: number | null
  actual_residual_mw: number | null
  residual_error_mw: number | null
  wind_error_mw: number | null
}
export interface ProcurementResponse {
  delivery_date: string
  cutoff: string
  mode: string
  demand_mw: number
  label: string
  summary: Record<string, number | null>
  points: ProcurementPoint[]
}

export interface ApiErrorBody { error: { code: string; message: string; details?: { field: string; issue: string }[] } }
