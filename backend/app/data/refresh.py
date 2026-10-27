"""Data-refresh command:  python -m app.data.refresh [--out DIR]

Downloads the configured evaluation window from the official Elexon API (FUELHH wind actuals and
WINDFOR forecasts, all publications) and writes a reproducible cache plus manifest.json.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.data.elexon_client import ElexonClient
from app.data.normalize import normalize_actuals, normalize_forecasts, quality_checks
from app.data.store import ACTUALS_FILE, FORECASTS_FILE, MANIFEST_FILE
from app.utils.timeutil import iso, local_day_bounds_utc


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(out_dir: Path) -> dict:
    s = get_settings()
    configure_logging(s.log_level)
    win_start, _ = local_day_bounds_utc(s.window_start)
    _, win_end = local_day_bounds_utc(s.window_end)  # exclusive
    client = ElexonClient(s)
    try:
        # Actuals are published ~at the end of their half hour, so publish window = delivery window + 30 min.
        print(f"FUELHH  publish {win_start:%F %R} -> {win_end + timedelta(hours=1):%F %R} UTC")
        act_raw = [r for chunk in client.wind_actuals(win_start, win_end + timedelta(hours=1)) for r in chunk]
        # Forecasts for the window were published from a few days earlier up to (and past) delivery.
        f_from = win_start - timedelta(days=4)
        f_to = win_end + timedelta(days=1)
        print(f"WINDFOR publish {f_from:%F %R} -> {f_to:%F %R} UTC")
        fc_raw = [r for chunk in client.wind_forecasts(f_from, f_to) for r in chunk]
    finally:
        client.close()

    actuals, aq = normalize_actuals(act_raw)
    forecasts, fq = normalize_forecasts(fc_raw)
    # Keep only delivery intervals inside the window.
    actuals = actuals[(actuals.start_time_utc >= pd.Timestamp(win_start)) & (actuals.start_time_utc < pd.Timestamp(win_end))]
    forecasts = forecasts[(forecasts.start_time_utc >= pd.Timestamp(win_start)) & (forecasts.start_time_utc < pd.Timestamp(win_end))]
    actuals = actuals.sort_values("start_time_utc").reset_index(drop=True)
    forecasts = forecasts.sort_values(["start_time_utc", "publish_time_utc"]).reset_index(drop=True)
    if actuals.empty or forecasts.empty:
        raise SystemExit("Refresh produced no data; refusing to overwrite the cache.")

    out_dir.mkdir(parents=True, exist_ok=True)
    for df, name in ((actuals, ACTUALS_FILE), (forecasts, FORECASTS_FILE)):
        out = df.copy()
        for c in out.columns:
            if c.endswith("_utc"):
                out[c] = out[c].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        # mtime=0 -> byte-reproducible gzip for identical input
        out.to_csv(out_dir / name, index=False, compression={"method": "gzip", "mtime": 0})

    manifest = {
        "data_mode": "elexon_cached",
        "description": "Real Elexon BMRS data (cached extract). Not synthetic.",
        "extracted_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window_start_date": s.window_start.isoformat(),
        "window_end_date": s.window_end.isoformat(),
        "window_start_utc": iso(win_start),
        "window_end_utc_exclusive": iso(win_end),
        "forecast_publish_range_requested_utc": [iso(f_from), iso(f_to)],
        "sources": {
            "actuals": f"{s.elexon_base_url}/datasets/FUELHH/stream?fuelType=WIND",
            "forecasts": f"{s.elexon_base_url}/datasets/WINDFOR/stream",
        },
        "units": "MW (FUELHH: 30-minute average; WINDFOR: hourly forecast)",
        "quality": {"actuals_ingest": aq, "forecasts_ingest": fq, **quality_checks(actuals, forecasts)},
        "files": {n: {"sha256": _sha(out_dir / n), "rows": int(len(d))}
                  for n, d in ((ACTUALS_FILE, actuals), (FORECASTS_FILE, forecasts))},
        "licence": "Contains BMRS data (c) Elexon Limited; used under the Elexon open data licence with attribution.",
    }
    (out_dir / MANIFEST_FILE).write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest["quality"], indent=2))
    return manifest


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--out", type=Path, default=None, help="output directory (default: DATA_DIR)")
    args = p.parse_args()
    run(args.out or get_settings().data_dir)


if __name__ == "__main__":
    sys.exit(main())
