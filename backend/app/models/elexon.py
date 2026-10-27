"""Typed models for the raw Elexon payloads (verified against live responses, Jan 2026).

FUELHH stream row:  {dataset, publishTime, startTime, settlementDate, settlementPeriod, fuelType, generation}
WINDFOR stream row: {dataset, publishTime, startTime, generation}
`generation` is MW in both datasets.
"""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, field_validator


class _Row(BaseModel):
    model_config = ConfigDict(extra="ignore")

    startTime: datetime
    publishTime: datetime
    generation: float | None = None

    @field_validator("generation", mode="before")
    @classmethod
    def _numeric_or_none(cls, v):
        # Null / empty / non-numeric values are kept as None (missing) - never coerced to 0.
        if v is None or isinstance(v, bool):
            return None
        try:
            f = float(v)
        except (TypeError, ValueError):
            return None
        return f if f == f and abs(f) != float("inf") else None


class FuelHHRow(_Row):
    fuelType: str
    settlementDate: date | None = None
    settlementPeriod: int | None = None


class WindForRow(_Row):
    pass
