"""API-level tests on the synthetic test fixture (small_repo); see conftest."""


def test_health_ok(client):
    j = client.get("/api/health").json()
    assert j["status"] == "ok" and j["data_loaded"] is True


def test_profile_uses_latest_vintage_before_cutoff(client):
    # cutoff between the two publications -> early vintage (1000 MW)
    r = client.get("/api/analysis/profile", params={"date": "2026-01-02", "cutoff": "2026-01-01T09:00:00Z"})
    assert r.status_code == 200
    j = r.json()
    assert j["forecast"]["mean_mw"] == 1000
    assert j["forecast"]["latest_publish_time_utc"] == "2026-01-01T06:00:00Z"
    # later cutoff -> later vintage
    j2 = client.get("/api/analysis/profile", params={"date": "2026-01-02", "cutoff": "2026-01-01T12:00:00Z"}).json()
    assert j2["forecast"]["mean_mw"] == 1200  # publication exactly at cutoff is eligible


def test_profile_before_any_publication_has_no_forecast(client):
    j = client.get("/api/analysis/profile", params={"date": "2026-01-02", "cutoff": "2026-01-01T00:00:00Z"}).json()
    assert j["forecast"]["intervals"] == 0 and j["forecast"]["mean_mw"] is None
    assert all(p["forecast_mw"] is None for p in j["points"])


def test_profile_gaps_are_null_not_zero_and_error_only_where_paired(client):
    j = client.get("/api/analysis/profile", params={"date": "2026-01-02", "cutoff": "2026-01-01T09:00:00Z"}).json()
    half_hours = [p for p in j["points"] if p["t"].endswith(":30:00Z")]
    assert all(p["forecast_mw"] is None and p["error_mw"] is None for p in half_hours)
    on_hour = [p for p in j["points"] if p["t"].endswith(":00:00Z")]
    assert all(p["error_mw"] == -100 for p in on_hour)  # forecast 1000 - actual 1100


def test_profile_period_selection(client):
    j = client.get("/api/analysis/profile", params={"date": "2026-01-02", "cutoff": "2026-01-01T09:00:00Z",
                                                    "period_from": "2026-01-02T06:00:00Z", "period_to": "2026-01-02T12:00:00Z"}).json()
    assert len(j["points"]) == 12 and j["forecast"]["intervals"] == 6


def test_accuracy_known_numbers(client):
    r = client.get("/api/analysis/accuracy", params={"start": "2026-01-02", "end": "2026-01-02",
                                                     "cutoff_days_before": 1, "cutoff_time": "09:00"})
    assert r.status_code == 200
    m = r.json()["metrics"]
    # D-1 09:00 -> early vintage 1000 vs actual 1100 at 24 hourly pairs
    assert m["n"] == 24 and m["mae_mw"] == 100 and m["bias_mw"] == -100 and m["rmse_mw"] == 100
    assert m["underforecast_share"] == 1.0
    assert r.json()["coverage"]["actual_intervals_without_forecast"] == 24


def test_accuracy_cutoff_changes_result(client):
    m = client.get("/api/analysis/accuracy", params={"start": "2026-01-02", "end": "2026-01-02", "cutoff_time": "13:00"}).json()["metrics"]
    assert m["bias_mw"] == 100  # later vintage 1200 vs 1100


def test_vintages_endpoint(client):
    j = client.get("/api/analysis/vintages", params={"date": "2026-01-02", "cutoff": "2026-01-01T09:00:00Z"}).json()
    assert j["total_publications"] == 2 and j["eligible_publications"] == 1
    assert [v["eligible"] for v in j["vintages"]] == [True, False]
    assert j["vintages"][0]["selected_intervals"] == 24


def test_procurement_sensitivity(client):
    j = client.get("/api/analysis/procurement-sensitivity",
                   params={"date": "2026-01-02", "cutoff": "2026-01-01T09:00:00Z", "demand_mw": 2000}).json()
    s = j["summary"]
    assert s["forecast_residual_mean_mw"] == 1000 and s["paired_actual_residual_mean_mw"] == 900
    assert s["residual_error_mean_mw"] == -100  # wind under-forecast -> residual over-estimated
    assert "ILLUSTRATIVE" in j["label"]


def test_actuals_and_forecast_endpoints(client):
    a = client.get("/api/actuals", params={"start": "2026-01-02T00:00:00Z", "end": "2026-01-02T01:00:00Z"}).json()
    assert a["count"] == 2 and a["kind"] == "measured"
    f = client.get("/api/forecasts", params={"start": "2026-01-02T00:00:00Z", "end": "2026-01-02T03:00:00Z",
                                             "cutoff": "2026-01-01T09:00:00Z"}).json()
    assert f["count"] == 3 and {r["generation_mw"] for r in f["records"]} == {1000}


# --- validation / errors ----------------------------------------------------------------------------------
def test_naive_cutoff_rejected(client):
    r = client.get("/api/analysis/profile", params={"date": "2026-01-02", "cutoff": "2026-01-01T09:00:00"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_parameters"


def test_bad_date_rejected(client):
    r = client.get("/api/analysis/profile", params={"date": "not-a-date"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_parameters"


def test_date_outside_window(client):
    r = client.get("/api/analysis/profile", params={"date": "2026-03-01"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "outside_data_window"


def test_negative_demand_rejected(client):
    r = client.get("/api/analysis/procurement-sensitivity", params={"date": "2026-01-02", "demand_mw": -5})
    assert r.status_code == 422


def test_accuracy_start_after_end(client):
    assert client.get("/api/analysis/accuracy", params={"start": "2026-01-05", "end": "2026-01-02"}).status_code == 422


def test_bad_cutoff_time(client):
    assert client.get("/api/analysis/accuracy", params={"start": "2026-01-02", "end": "2026-01-02", "cutoff_time": "9am"}).status_code == 422


def test_missing_required_param(client):
    assert client.get("/api/actuals", params={"start": "2026-01-02T00:00:00Z"}).status_code == 422


def test_data_unavailable_returns_503_without_stack_trace():
    from fastapi.testclient import TestClient
    from app.main import create_app
    app = create_app()
    with TestClient(app) as c:
        app.state.repo = None
        app.state.repo_error = "Cached Elexon data not found"
        r = c.get("/api/metadata")
        assert r.status_code == 503 and r.json()["error"]["code"] == "data_unavailable"
        assert "Traceback" not in r.text
        assert c.get("/api/health").json()["status"] == "degraded"


def test_empty_day_no_data_at_all(client, small_repo):
    # A date inside the window but with no data at all: honest empty result, not an error
    j = client.get("/api/analysis/profile", params={"date": "2026-01-20", "cutoff": "2026-01-19T09:00:00Z"}).json()
    assert j["mode"] == "prospective" and j["forecast"]["intervals"] == 0 and "No forecast" in j["insight"]
