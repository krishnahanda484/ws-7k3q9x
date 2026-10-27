"""Environment-driven configuration. Every setting can be overridden with an env var."""
from __future__ import annotations

from datetime import date
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# repo_root/backend/app/core/config.py -> repo_root
_REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Where the cached Elexon extract lives (csv.gz files + manifest.json).
    data_dir: Path = _REPO_ROOT / "data"

    # Comma separated list of allowed browser origins.
    cors_origins: str = "http://localhost:5173,http://localhost:8080"

    log_level: str = "INFO"

    # Official Elexon Insights (BMRS) API. No API key is required for these datasets.
    elexon_base_url: str = "https://data.elexon.co.uk/bmrs/api/v1"
    http_timeout_seconds: float = 30.0
    http_max_retries: int = 4
    http_backoff_seconds: float = 1.5
    fetch_chunk_days: int = 7  # bounded request windows keep each response small

    # Explicit evaluation window: delivery dates (Europe/London) the app supports.
    window_start: date = date(2026, 1, 1)
    window_end: date = date(2026, 1, 31)

    # Default day-ahead decision rule used when the caller does not supply a cutoff:
    # "D-1 at 09:00 UK local time". Purely a UI/API default; always overridable.
    default_cutoff_days_before: int = 1
    default_cutoff_local_time: str = "09:00"

    @field_validator("log_level")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.upper()

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
