# Methodology

## 1. Forecast cutoff semantics

A **decision cutoff** `C` is the instant after which the procurement desk can no longer use new information (UK local time in the UI, stored and compared as UTC). For delivery interval `t` the eligible forecasts are

    E(t, C) = { f(t, p) : p <= C }       (publishTime <= C; equality is eligible)

and the decision forecast is the one with the greatest publish time:

    f*(t, C) = f(t, p*),   p* = max{ p in E(t, C) }

* A forecast published after `C` is never used for the decision, in any endpoint. The Forecast Explorer can *display* later publications, clearly marked "after cutoff".
* If `E(t, C)` is empty the interval has **no forecast** (null). It is not back-filled from a later vintage and not interpolated.
* Ties on identical `(t, p)` are resolved deterministically (greater generation wins) after normalisation already collapsed duplicates.
* Different delivery hours may legitimately come from different publications because each WINDFOR publication covers a rolling horizon.
* Cutoffs must carry a time-zone offset (`Z` or `+01:00`). A naive timestamp is rejected (422) to prevent silent mis-interpretation across BST/GMT.

### Back-testing rule

A single fixed cutoff cannot evaluate many delivery days (a cutoff on 14 Jan says nothing about 20 Jan). The accuracy endpoint therefore applies a **rolling day-ahead rule** - "N days before the delivery date at HH:MM UK local time" (default: 1 day before, 09:00) - so every delivery day is judged on exactly the information that would have been available at the same point in its decision cycle. The UI derives N and HH:MM from the cutoff chosen in the decision bar. (A cutoff after the start of the delivery day maps to N = 0.)

## 2. Alignment and missing data

* Actuals (FUELHH, half-hourly) and the selected forecast (WINDFOR, hourly) are inner-joined on the **exact `start_time_utc`**. No nearest-neighbour matching, no interpolation.
* Only on-the-hour timestamps can pair. The 744 `:30` actual half-hours stay visible on charts but are excluded from error statistics; this is reported as `actual_intervals_without_forecast` in the API and in the UI.
* Null or missing values are excluded, never treated as zero. Duplicate pairs are removed before metrics.
* Overview KPIs: "Actual wind (mean)" uses all half-hours of the selected period; the error metrics use only paired hours. These can differ slightly and are labelled accordingly.

## 3. Metrics and sign convention

Let `y` = actual, `y_hat` = forecast available at the cutoff, `e = y_hat - y`, `n` = number of valid pairs.

| Metric | Definition | Note |
| --- | --- | --- |
| MAE | `mean(abs(e))` | MW |
| RMSE | `sqrt(mean(e^2))` | MW; >= MAE |
| Bias / ME | `mean(e)` | **positive = over-forecast, negative = under-forecast** |
| MAPE | `100 * mean(abs(e / y))` over `y != 0` | zero-actuals excluded and counted; `mape_n` reported. If no non-zero actuals, MAPE is `null` |
| MAE % of mean actual | `MAE / mean(y) * 100` | ratio of means, not a mean of per-interval ratios |
| Abs-error P50/P90/P95, max | percentiles with linear interpolation | |
| Over / under share | share of pairs with `e > 0` / `e < 0` | |
| By hour of day | metrics grouped by **UK local** delivery hour | |
| Error histogram | 1,000 MW signed-error buckets | |

MAPE is dominated by low-wind hours; MAE and RMSE are the primary metrics. In January 2026 there were no zero actuals, but the exclusion logic is tested.

### Colour heuristic

KPI colour on the Overview is a display heuristic only: MAE as % of mean actual `<10%` green, `10-20%` amber, `>20%` red.

## 4. MW versus MWh

Both datasets give **average power in MW**. Energy = MW x duration. A half-hour average MW multiplies by 0.5 h. The only energy figure shown is the signed-error total on the Accuracy page, computed as `sum(e) * 0.5 h` under the stated assumption that each paired MW value represents a 30-minute average. Because WINDFOR values are hourly, this is an indicative figure and is flagged as an assumption. Interval-level errors are always in MW.

## 5. Historical uncertainty band

On the Overview the optional band is `forecast + P10(actual - forecast)` to `forecast + P90(...)`, where the residuals come from **earlier delivery days only** (1 Jan to the day before the selected date) under the same cutoff rule - so it uses no information from the selected day. It is an empirical description of past errors, not a calibrated probabilistic forecast; it is unavailable for 1 Jan and rough for the first days of the month. The lower edge is floored at 0 MW.

## 6. Procurement sensitivity (illustrative)

Demand `D` (MW) is supplied by the user; there is no default.

    R_hat = max(0, D - W_hat)     forecast-implied residual requirement
    R     = max(0, D - W)         actual-implied residual (retrospective only)
    E_R   = R - R_hat             residual-requirement error

Properties: if `D` exceeds both `W` and `W_hat`, `E_R = W_hat - W` (the forecast error with the sign flipped; over-forecasting wind under-states the residual). If wind covers `D` in both, `E_R = 0`. If only one covers demand the error is clipped by `D`.

Assumptions and exclusions: demand is constant over the period; only wind plus an unspecified residual source exist; no prices, interconnectors, storage, thermal availability, demand-forecast error or contract positions. The tool therefore **cannot** state what to buy, expected savings or trading performance, and the UI says so. A real recommendation would need half-hourly demand forecasts, market prices and liquidity, plant availability and the utility's existing hedge position.

## 7. Limitations of national wind only

* No regional resolution, weather inputs, curtailment or embedded-generation detail.
* WINDFOR and FUELHH may not measure exactly the same quantity (forecast of national wind versus metered outturn by fuel type). In January 2026 the cached forecast over-predicted outturn by ~1,850 MW on average (84.8% of hours over-forecast). This is reported as observed; **the cause has not been investigated** and may be partly definitional rather than a pure forecast-skill issue.
* One month is a small, single-season sample; metrics are not evidence of performance in other months.
* `publishTime` is taken as the moment a forecast became usable. Real-world data-feed latency is not modelled.
* Day-ahead gate timing differs by market and venue; the default D-1 09:00 UK is a configurable convention, not a claim about the client's actual process.
