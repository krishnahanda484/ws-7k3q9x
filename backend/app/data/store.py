"""Repository over the cached Elexon extract (gzip CSV + manifest). Loaded once, held in memory
(~20k forecast rows / ~1.5k actual rows for January 2026, so no database is warranted)."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import pandas as pd

from app.core.errors import DataUnavailableError

log = logging.getLogger("windsight.store")

ACTUALS_FILE = "wind_actuals_fuelhh.csv.gz"
FORECASTS_FILE = "wind_forecasts_windfor.csv.gz"
MANIFEST_FILE = "manifest.json"


@dataclass
class DataRepository:
    actuals: pd.DataFrame
    forecasts: pd.DataFrame
    manifest: dict = field(default_factory=dict)

    # ---- queries -------------------------------------------------------------
    def actuals_between(self, start: datetime, end: datetime) -> pd.DataFrame:
        a = self.actuals
        return a[(a.start_time_utc >= pd.Timestamp(start)) & (a.start_time_utc < pd.Timestamp(end))]

    def forecasts_between(self, start: datetime, end: datetime) -> pd.DataFrame:
        f = self.forecasts
        return f[(f.start_time_utc >= pd.Timestamp(start)) & (f.start_time_utc < pd.Timestamp(end))]

    @property
    def data_mode(self) -> str:
        return self.manifest.get("data_mode", "unknown")


def _read(path: Path, time_cols: list[str]) -> pd.DataFrame:
    df = pd.read_csv(path)
    for c in time_cols:
        df[c] = pd.to_datetime(df[c], utc=True)
    return df


def load_repository(data_dir: Path) -> DataRepository:
    a_path, f_path, m_path = data_dir / ACTUALS_FILE, data_dir / FORECASTS_FILE, data_dir / MANIFEST_FILE
    missing = [p.name for p in (a_path, f_path, m_path) if not p.exists()]
    if missing:
        raise DataUnavailableError(
            f"Cached Elexon data not found ({', '.join(missing)}). Run `python -m app.data.refresh` in backend/ to populate it."
        )
    repo = DataRepository(
        actuals=_read(a_path, ["start_time_utc"]),
        forecasts=_read(f_path, ["start_time_utc", "publish_time_utc"]),
        manifest=json.loads(m_path.read_text(encoding="utf-8")),
    )
    log.info("data loaded", extra={"ctx": {"actuals": len(repo.actuals), "forecasts": len(repo.forecasts)}})
    return repo
