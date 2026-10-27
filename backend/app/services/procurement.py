"""Illustrative procurement sensitivity. NOT a procurement requirement: demand is user-supplied and
the only supply modelled is wind; there are no prices, thermal plant, imports or contract positions.

  R_hat = max(0, D - W_hat)      forecast residual requirement
  R     = max(0, D - W)          actual residual requirement (retrospective only)
  E_R   = R - R_hat              residual-requirement error (positive = needed MORE than forecast implied)
"""
from __future__ import annotations

import math


def residual(demand_mw: float, wind_mw: float | None) -> float | None:
    if wind_mw is None or (isinstance(wind_mw, float) and math.isnan(wind_mw)):
        return None
    return max(0.0, demand_mw - wind_mw)


def residual_error(demand_mw: float, forecast_mw: float | None, actual_mw: float | None) -> dict:
    r_hat = residual(demand_mw, forecast_mw)
    r = residual(demand_mw, actual_mw)
    e = None if r is None or r_hat is None else r - r_hat
    return {"forecast_residual_mw": r_hat, "actual_residual_mw": r, "residual_error_mw": e}
