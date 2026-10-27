# Cached Elexon extract

| File | Content |
| --- | --- |
| `wind_actuals_fuelhh.csv.gz` | Real FUELHH `WIND` outturn, half-hourly, MW. Columns: `start_time_utc, generation_mw, fuel_type, source` |
| `wind_forecasts_windfor.csv.gz` | Real WINDFOR forecast publications (every vintage), hourly delivery, MW. Columns: `start_time_utc, publish_time_utc, generation_mw, source` |
| `manifest.json` | Extraction timestamp, window, source URLs, ingest/quality counters, SHA-256 of each file |

These are **real observations** downloaded from the official Elexon Insights API (`data_mode: elexon_cached`), not synthetic data, and are small (~0.2 MB) so they are committed for reproducibility and so the hosted demo does not depend on a live external API.

Refresh (needs internet; no API key):

```bash
cd backend
python -m app.data.refresh          # writes ../data/*
```

The command refuses to overwrite the cache if a refresh returns no rows.

Attribution: Contains BMRS data © Elexon Limited, used under the Elexon open data licence.
