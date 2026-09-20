"""Public stats endpoint."""

from tests.conftest import create_sighting


def test_stats_empty(client):
    assert client.get("/api/stats").json() == {"total_cats": 0}


def test_stats_is_no_cache(client):
    """The worldwide count must not be cached, so it can't go stale."""
    res = client.get("/api/stats")
    assert res.headers.get("cache-control") == "no-cache"


def test_stats_counts_active(client):
    create_sighting(client, "device-aaaa")
    create_sighting(client, "device-bbbb")
    assert client.get("/api/stats").json() == {"total_cats": 2}


def test_stats_excludes_hidden(client):
    res = create_sighting(client, "device-aaaa")
    sighting_id = res.json()["id"]
    for i in range(3):
        client.post(
            f"/api/sightings/{sighting_id}/report",
            headers={"X-Device-Token": f"reporter-{i}"},
            data={"reason": "spam"},
        )
    assert client.get("/api/stats").json() == {"total_cats": 0}


def test_stats_detail(client):
    a = create_sighting(client, "device-aaaa", is_ear_tipped="true").json()["id"]
    create_sighting(client, "device-bbbb", is_ear_tipped="false")
    create_sighting(client, "device-cccc", kind="missing")
    client.post(f"/api/sightings/{a}/confirm", headers={"X-Device-Token": "confirmer-1"})

    d = client.get("/api/stats/detail?days=7").json()
    assert d["total_cats"] == 3
    assert d["missing_active"] == 1
    assert d["reunited"] == 0
    assert d["confirmations_total"] == 1
    assert d["ear_tipped_share"] == 0.5
    assert d["stray_share"] is None
    assert len(d["sightings_by_day"]) == 7
    assert sum(p["count"] for p in d["sightings_by_day"]) == 3
    assert client.get("/api/stats/detail?days=3").status_code == 422
    # Legacy endpoint is unchanged.
    assert client.get("/api/stats").json() == {"total_cats": 3}


def test_stats_detail_counts_reunited_not_deceased(client):
    ok = create_sighting(client, "owner-happy", kind="missing").json()["id"]
    sad = create_sighting(client, "owner-sad01", kind="missing").json()["id"]
    client.post(f"/api/sightings/{ok}/found", headers={"X-Device-Token": "owner-happy"})
    client.post(
        f"/api/sightings/{sad}/found",
        headers={"X-Device-Token": "owner-sad01"},
        data={"outcome": "deceased"},
    )
    assert client.get("/api/stats/detail").json()["reunited"] == 1
