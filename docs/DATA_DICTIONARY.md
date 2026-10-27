# Data dictionary and API findings

Everything below was verified against the live Elexon Insights API (OpenAPI spec at `https://data.elexon.co.uk/swagger/v1/swagger.json`) and real responses, during extraction of the January 2026 window.

## Endpoints

The brief links the documentation pages on `bmrs.elexon.co.uk`; the API itself is served from **`https://data.elexon.co.uk/bmrs/api/v1`**. No API key was required for either dataset.

| Dataset | Path | Parameters (from the OpenAPI spec) |
| --- | --- | --- |
| FUELHH (actuals) | `GET /datasets/FUELHH/stream` | `publishDateTimeFrom`, `publishDateTimeTo`, `settlementDateFrom`, `settlementDateTo`, `settlementPeriod[]`, `fuelType[]` (settlement-date params cannot be combined with publish-date params) |
| WINDFOR (forecasts) | `GET /datasets/WINDFOR/stream` | `publishDateTimeFrom`, `publishDateTimeTo` only. With no filter it returns the latest publication |

Observed behaviour:

* Both `stream` endpoints return a **bare JSON array**, no envelope and **no pagination**. A full month of WINDFOR (all publications, ~2 MB) and FUELHH WIND (~270 kB) each came back in one ~2 s request. The client still requests 7-day windows (`FETCH_CHUNK_DAYS`) so memory and response size stay bounded.
* **Filtering is by publish time, not delivery time.** To get delivery period D you must request the publish window around it (actuals publish 30 min after the period starts; forecasts are published up to ~3 days ahead).
* `fuelType=WIND` is honoured server-side; the client also filters locally (`fuelType == "WIND"`).
* Rate limits are not stated in the spec; none were hit. The client retries `429/5xx/timeouts` with exponential back-off and honours `Retry-After`.

## Raw schemas

**FUELHH row**: `dataset`, `publishTime`, `startTime`, `settlementDate`, `settlementPeriod`, `fuelType`, `generation`
**WINDFOR row**: `dataset`, `publishTime`, `startTime`, `generation`

| Field | Meaning | Notes |
| --- | --- | --- |
| `startTime` | Start of the delivery period, UTC (`...Z`) | FUELHH: every 30 min. **WINDFOR: on the hour only** (hourly forecast) |
| `publishTime` | When the record was published, UTC | FUELHH: `startTime + 30 min` (outturn is published after the period). WINDFOR: the forecast vintage |
| `generation` | MW | FUELHH: average over the 30-min period. WINDFOR: forecast MW for the hour. Integers in the payload. No unit conversion is applied |
| `settlementDate` / `settlementPeriod` | GB settlement day and period (1-48, 46/50 on clock-change days) | Kept for reference only; not used for joins |

## WINDFOR publication behaviour (January 2026)

* 272 publications in the extract, **~8 per day**, normally at **02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30, 22:30 UTC**, with an occasional ad-hoc one (e.g. 12:25 on 15 Jan).
* Each publication covers a rolling horizon from roughly a day before its publish time to ~2 days after (observed lead from -26 h to +66 h relative to delivery start; later publications include hours that have already started). A delivery hour therefore has **24-32 vintages**.
* Consecutive early-morning publications are sometimes nearly identical (e.g. the 02:30/04:30/07:30 UTC publications on 14 Jan for 15 Jan have means of 11,609.62 / 11,609.58 / 11,609.58 MW), so the latest eligible vintage can match an older one in value even though its timestamp differs.
* Because each publication covers a window rather than a whole day, some hours of a delivery day have no eligible publication for very early cutoffs; they are reported as missing.

## Missing values, duplicates, revisions

| Topic | Finding / policy |
| --- | --- |
| Null / non-numeric `generation` | None occurred in January 2026. The normaliser drops such rows (never zero-fills) and counts them in `manifest.json -> quality`. |
| Malformed rows | Rows failing the typed model (e.g. bad timestamp) are skipped and counted (`invalid_rows`). |
| Actual duplicates | 4 duplicate FUELHH rows appeared at chunk boundaries (overlapping publish windows). Policy: key = `start_time_utc`; keep the row with the latest `publishTime`, tie -> greater generation. |
| Forecast duplicates | Key = (`start_time_utc`, `publish_time_utc`). Exact duplicates collapse; conflicting values keep the greater generation. None occurred. |
| Forecast revisions | Preserved: every (delivery hour, publication) pair is stored. Selection happens at query time (see METHODOLOGY). |
| Gaps in actuals | 0 missing half-hours across 1 - 31 Jan 2026 (1,488 intervals). |
| Negative values | None in either dataset. |

## Internal schemas

`wind_actuals_fuelhh.csv.gz`: `start_time_utc, generation_mw, fuel_type, source`
`wind_forecasts_windfor.csv.gz`: `start_time_utc, publish_time_utc, generation_mw, source`
All timestamps are UTC ISO-8601 (`Z`); the API/UI convert to Europe/London for display. `source` is `elexon:FUELHH` / `elexon:WINDFOR` for traceability. `manifest.json` records extraction time, window, source URLs, quality counters and SHA-256 checksums.

## Coverage of the cached extract

| Item | Value |
| --- | --- |
| Delivery window | 2026-01-01 00:00 to 2026-01-31 24:00 UK (= UTC in January) |
| Actual intervals | 1,488 half-hours (complete) |
| Forecast rows | 18,104 over 744 delivery hours, 272 publications |
| Pairable hourly actual/forecast timestamps | 744 |

The January 2026 window is fixed in configuration (`WINDOW_START`/`WINDOW_END`); requests outside it return `422 outside_data_window`.
