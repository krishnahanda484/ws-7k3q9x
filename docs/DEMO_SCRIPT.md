# Demo script (10 minutes)

No video has been recorded or uploaded; this is a recording-ready plan. Numbers quoted below come from the cached January 2026 data (they are produced by the app - re-check on screen before speaking them).

## Preparation

* Start the app (`docker compose up --build`, or backend + `npm run dev`). Warm the hosted API by opening `/api/health` first.
* Browser at 1440×900, zoom 100 %, window only (no bookmarks bar, no personal tabs). Pre-load Overview with delivery date **15 Jan 2026**, cutoff **14 Jan 09:00**.
* Screenshots worth saving: Overview with profile chart; Forecast Explorer with "show vintages after cutoff" ticked; Accuracy page; Procurement panel with 20,000 MW example filled; Swagger `/docs`; test output; `/api/health`.
* Recording: OBS or Loom, 1080p, then upload to YouTube as **Unlisted**; keep it ≤ 10:00.

## Part 1 - Customer (0:00-5:00)

**0:00-1:00 · Business problem** (Overview, Insight box visible)
"A UK supplier must buy tomorrow's power today. Wind is weather-dependent, and the forecast changes several times a day. The question isn't 'what was the best forecast?' but 'what did we know when we had to decide?'"

**1:00-2:00 · Decision-ready forecast** (decision bar → Overview)
Delivery date 15 Jan, cutoff 14 Jan 09:00 (UK). Point to: the forecast mean (≈11.6 GW), the **publication timestamp (14 Jan 07:30)**, the "REAL ELEXON DATA · CACHED" badge and extraction date. Change the cutoff to 14 Jan 12:00: the timestamp and values update - "same day, different information". Reset.
Chart: blue = forecast available at cutoff, black = what actually happened afterwards; the shaded band is built only from *earlier* days.

**2:00-3:00 · Forecast reliability** (Accuracy Analysis)
Whole month under this rule: MAE ≈ 2.1 GW, RMSE ≈ 2.6 GW, bias **+1.9 GW (over-forecast in ~85 % of hours)**. "Positive bias means the forecast was above reality." Show MAE by hour (largest in the early hours) and the worst day (28 Jan, ≈ 5.3 GW) versus the best (19 Jan, ≈ 0.7 GW). Be candid: part of the bias may be a definition mismatch between the two datasets - flagged, not hidden.

**3:00-4:00 · Procurement implications** (Overview → Procurement panel)
Click *Fill example* (20,000 MW, **arbitrary - labelled illustrative**). Show forecast-implied residual (≈ 8.4 GW mean), the hindsight residual and the error ≈ +1.0 GW: "when demand exceeds wind, over-forecast wind means you under-bought by roughly the forecast error." State what is missing for a real recommendation: demand forecast, prices, plant availability, hedge position.

**4:00-5:00 · Value and next steps**
Transparency (every forecast revision auditable), no look-ahead, a quantitative base for deciding how much margin to carry. "We have not measured savings and do not claim any." Next: add demand/price data, probabilistic forecasts, scheduled refresh.

## Part 2 - Technical review (5:00-10:00)

**5:00-6:00 · Architecture** (README diagram → `docs/ARCHITECTURE.md`)
React/TS frontend → typed service layer → FastAPI. Elexon is called only by the refresh job (`app/data/refresh.py`); the API serves a cached, checksummed extract (`data/manifest.json`). Show the repo tree.

**6:00-7:00 · Data correctness** (Forecast Explorer + `services/vintage.py`)
Explorer: 32 publications, 11 eligible, table shows which supplies how many hours. Tick "after cutoff" to show late vintages dashed and excluded. Code: `publish_time_utc <= cutoff`, sort, `drop_duplicates(keep='last')`. UTC internally, `Europe/London` for display; naive cutoffs rejected (try it at `/docs`).

**7:00-8:00 · Analytics** (`services/metrics.py`, `procurement.py`)
Exact-timestamp `align()`: no interpolation, no zero-fill, half-hour actuals unpaired (reported). Sign convention. MAPE excludes zero actuals and reports `mape_n`. Procurement maths in four lines.

**8:00-9:00 · Engineering quality**
`python -m pytest -q` → 58 passed (boundary cases: publish exactly at cutoff, no eligible forecast, zero actual, duplicates, retries, validation). `npm run typecheck && npm run lint && npm test && npm run build`. Show `Dockerfile`s, `docker-compose.yml`, `.env.example`, centralised error envelope, CORS restriction.

**9:00-10:00 · Deployment and limitations**
Show the deployed URL and `/api/health` (only if deployed). README limitations: cached not live, one month, hourly pairing, bias cause unexplained, illustrative procurement model, AI-assisted development disclosed.

## Commands to have ready

```bash
docker compose up --build
curl http://localhost:8000/api/health
curl "http://localhost:8000/api/analysis/profile?date=2026-01-15&cutoff=2026-01-14T09:00:00Z"
curl "http://localhost:8000/api/analysis/profile?date=2026-01-15&cutoff=2026-01-14T09:00:00"   # 422: no offset
cd backend && python -m pytest -q
```

_Live app: https://ws-7k3q9x.vercel.app (warm the API via /api/health a minute before recording)._
