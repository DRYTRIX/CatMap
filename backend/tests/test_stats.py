"""Public stats endpoint."""

from tests.conftest import create_sighting


def test_stats_empty(client):
    assert client.get("/api/stats").json() == {"total_cats": 0}


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
