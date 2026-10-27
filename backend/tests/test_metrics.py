import math

import pandas as pd
import pytest

from app.services import metrics as M
from app.services.procurement import residual, residual_error
from tests.conftest import act_df, fc_df, ts


def _pairs(actual, forecast):
    a = act_df([(f"2026-01-02 {i:02d}:00", v) for i, v in enumerate(actual)])
    f = fc_df([(f"2026-01-02 {i:02d}:00", "2026-01-01 06:00", v) for i, v in enumerate(forecast)])
    return M.align(a, f)


def test_known_values():
    # actual [100, 200, 300], forecast [110, 180, 330] -> errors (f - a) = [10, -20, 30]
    m = M.compute_metrics(_pairs([100, 200, 300], [110, 180, 330]))
    assert m["n"] == 3
    assert m["mae_mw"] == pytest.approx(20.0)
    assert m["rmse_mw"] == pytest.approx(math.sqrt((100 + 400 + 900) / 3))
    assert m["bias_mw"] == pytest.approx(20 / 3)
    assert m["mape_pct"] == pytest.approx((0.10 + 0.10 + 0.10) / 3 * 100)
    assert m["overforecast_count"] == 2 and m["underforecast_count"] == 1


def test_bias_sign_positive_means_overforecast():
    assert M.compute_metrics(_pairs([100], [150]))["bias_mw"] == 50
    assert M.compute_metrics(_pairs([100], [50]))["bias_mw"] == -50


def test_zero_actual_excluded_from_mape_but_not_mae():
    m = M.compute_metrics(_pairs([0, 100], [10, 110]))
    assert m["n"] == 2 and m["mape_n"] == 1 and m["mape_excluded_zero_actuals"] == 1
    assert m["mape_pct"] == pytest.approx(10.0)
    assert m["mae_mw"] == pytest.approx(10.0)


def test_all_zero_actuals_gives_no_mape():
    m = M.compute_metrics(_pairs([0, 0], [5, 5]))
    assert m["mape_pct"] is None and m["mape_n"] == 0 and m["mae_mw"] == 5


def test_empty_pairs():
    m = M.compute_metrics(_pairs([], []))
    assert m["n"] == 0 and m["mae_mw"] is None and m["rmse_mw"] is None


def test_align_requires_exact_timestamp_match_and_drops_missing():
    a = act_df([("2026-01-02 00:00", 100), ("2026-01-02 00:30", 90), ("2026-01-02 01:00", float("nan"))])
    f = fc_df([("2026-01-02 00:00", "2026-01-01 06:00", 110), ("2026-01-02 01:00", "2026-01-01 06:00", 120),
               ("2026-01-02 02:00", "2026-01-01 06:00", 130)])
    p = M.align(a, f)
    assert p.start_time_utc.tolist() == [ts("2026-01-02 00:00")]  # :30 has no forecast, NaN actual dropped, 02:00 has no actual


def test_align_removes_duplicate_pairs():
    a = act_df([("2026-01-02 00:00", 100), ("2026-01-02 00:00", 100)])
    f = fc_df([("2026-01-02 00:00", "2026-01-01 06:00", 110)])
    assert len(M.align(a, f)) == 1


def test_missing_is_not_treated_as_zero():
    # If NaN were zero the MAE would be (10 + 100)/2
    p = _pairs([100, float("nan")], [110, 100])
    assert M.compute_metrics(p)["mae_mw"] == 10


def test_percentiles_and_histogram():
    p = _pairs([1000] * 5, [1000, 1100, 900, 1500, 500])
    m = M.compute_metrics(p)
    assert m["abs_error_p50_mw"] == 100 and m["max_abs_error_mw"] == 500
    h = M.error_histogram(p["error_mw"], 500)
    assert sum(b["count"] for b in h) == 5


def test_mwh_assumption_uses_half_hour():
    m = M.compute_metrics(_pairs([100, 100], [120, 140]))  # signed errors 20, 40 -> 60 MW * 0.5 h
    assert m["total_signed_error_mwh_assuming_half_hour"] == 30


# --- procurement sensitivity ------------------------------------------------------------------
def test_residual_floors_at_zero():
    assert residual(1000, 400) == 600
    assert residual(1000, 1500) == 0
    assert residual(1000, None) is None


def test_residual_error_equals_negative_wind_error_when_demand_exceeds_both():
    r = residual_error(2000, forecast_mw=1200, actual_mw=1000)  # over-forecast wind by 200
    assert r == {"forecast_residual_mw": 800, "actual_residual_mw": 1000, "residual_error_mw": 200}


def test_residual_error_zero_when_wind_covers_demand_in_both():
    assert residual_error(500, 1200, 1000)["residual_error_mw"] == 0


def test_residual_error_clipped_by_demand():
    # actual wind far below demand but forecast above demand: error limited to the demand shortfall
    assert residual_error(1000, 1500, 200)["residual_error_mw"] == 800


def test_residual_error_none_without_actual():
    assert residual_error(1000, 800, None)["residual_error_mw"] is None
