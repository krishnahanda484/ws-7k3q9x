"""HTTP clients for the two official Elexon Insights endpoints.

Both `/datasets/{DATASET}/stream` endpoints are filtered by *publish* time
(`publishDateTimeFrom` / `publishDateTimeTo`) and return a bare JSON array. No API key is needed.
Requests are made in bounded windows so a response never grows unbounded.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta
from typing import Callable, Iterator

import httpx

from app.core.config import Settings
from app.core.errors import UpstreamError

log = logging.getLogger("windsight.elexon")

_RETRY_STATUS = {429, 500, 502, 503, 504}


class ElexonClient:
    def __init__(self, settings: Settings, client: httpx.Client | None = None, sleep: Callable[[float], None] = time.sleep):
        self._s = settings
        self._client = client or httpx.Client(
            base_url=settings.elexon_base_url,
            timeout=settings.http_timeout_seconds,
            headers={"Accept": "application/json", "User-Agent": "windsight/1.0"},
        )
        self._sleep = sleep

    def close(self) -> None:
        self._client.close()

    def _get_json(self, path: str, params: dict) -> list[dict]:
        attempt = 0
        while True:
            try:
                resp = self._client.get(path, params=params)
                if resp.status_code in _RETRY_STATUS:
                    raise _Retry(f"HTTP {resp.status_code}", resp.headers.get("Retry-After"))
                resp.raise_for_status()
                data = resp.json()
                if not isinstance(data, list):
                    raise UpstreamError("Unexpected Elexon response shape (expected a JSON array).")
                return data
            except (httpx.TimeoutException, httpx.TransportError, _Retry) as exc:
                attempt += 1
                if attempt > self._s.http_max_retries:
                    raise UpstreamError(f"Elexon request failed after {attempt} attempts: {exc}") from exc
                delay = self._s.http_backoff_seconds * 2 ** (attempt - 1)
                if isinstance(exc, _Retry) and exc.retry_after:
                    try:
                        delay = max(delay, float(exc.retry_after))
                    except ValueError:
                        pass
                log.warning("retrying Elexon request", extra={"ctx": {"path": path, "attempt": attempt, "delay": delay}})
                self._sleep(delay)
            except httpx.HTTPStatusError as exc:
                raise UpstreamError(f"Elexon returned HTTP {exc.response.status_code} for {path}") from exc
            except ValueError as exc:  # invalid JSON
                raise UpstreamError("Elexon returned a non-JSON response.") from exc

    def _windows(self, start: datetime, end: datetime) -> Iterator[tuple[datetime, datetime]]:
        step = timedelta(days=self._s.fetch_chunk_days)
        cur = start
        while cur < end:
            nxt = min(cur + step, end)
            yield cur, nxt
            cur = nxt

    @staticmethod
    def _fmt(dt: datetime) -> str:
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    def wind_actuals(self, publish_from: datetime, publish_to: datetime) -> Iterator[list[dict]]:
        """FUELHH rows (WIND only; filtered server-side AND again locally during normalisation)."""
        for a, b in self._windows(publish_from, publish_to):
            yield self._get_json(
                "/datasets/FUELHH/stream",
                {"publishDateTimeFrom": self._fmt(a), "publishDateTimeTo": self._fmt(b), "fuelType": "WIND"},
            )

    def wind_forecasts(self, publish_from: datetime, publish_to: datetime) -> Iterator[list[dict]]:
        """WINDFOR rows: every forecast publication in the window (all vintages)."""
        for a, b in self._windows(publish_from, publish_to):
            yield self._get_json(
                "/datasets/WINDFOR/stream",
                {"publishDateTimeFrom": self._fmt(a), "publishDateTimeTo": self._fmt(b)},
            )


class _Retry(Exception):
    def __init__(self, msg: str, retry_after: str | None = None):
        super().__init__(msg)
        self.retry_after = retry_after
