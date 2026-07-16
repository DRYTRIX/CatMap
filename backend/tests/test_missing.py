"""Missing-cat posts: kind field and mark-as-found lifecycle."""

from tests.conftest import create_sighting


def test_create_defaults_to_sighting_kind(client):
    body = create_sighting(client, "owner-001").json()
    assert body["kind"] == "sighting"
    assert body["status"] == "active"

    detail = client.get(f"/api/sightings/{body['id']}").json()
    assert detail["kind"] == "sighting"
    assert detail["status"] == "active"


def test_create_missing_kind(client):
    body = create_sighting(client, "owner-001", kind="missing").json()
    assert body["kind"] == "missing"
    assert body["status"] == "active"

    dots = client.get(
        "/api/sightings",
        params={"min_lat": -90, "max_lat": 90, "min_lng": -180, "max_lng": 180},
    ).json()
    assert len(dots) == 1
    assert dots[0]["kind"] == "missing"


def test_create_rejects_invalid_kind(client):
    res = create_sighting(client, "owner-001", kind="lost")
    assert res.status_code == 400


def test_kind_filter_on_list_and_clusters(client):
    create_sighting(client, "owner-001", kind="sighting", lat=40.0, lng=-3.0)
    create_sighting(client, "owner-002", kind="missing", lat=40.1, lng=-3.1)

    sightings = client.get(
        "/api/sightings",
        params={
            "min_lat": -90,
            "max_lat": 90,
            "min_lng": -180,
            "max_lng": 180,
            "kind": "sighting",
        },
    ).json()
    assert len(sightings) == 1
    assert sightings[0]["kind"] == "sighting"

    missing = client.get(
        "/api/sightings",
        params={
            "min_lat": -90,
            "max_lat": 90,
            "min_lng": -180,
            "max_lng": 180,
            "kind": "missing",
        },
    ).json()
    assert len(missing) == 1
    assert missing[0]["kind"] == "missing"

    clusters = client.get(
        "/api/sightings/clusters",
        params={
            "min_lat": -90,
            "max_lat": 90,
            "min_lng": -180,
            "max_lng": 180,
            "zoom": 5,
            "kind": "missing",
        },
    ).json()
    assert sum(c["count"] for c in clusters) == 1


def test_mark_found_creator_only_removes_from_map_keeps_in_mine(client):
    sid = create_sighting(client, "owner-001", kind="missing").json()["id"]

    assert (
        client.post(
            f"/api/sightings/{sid}/found", headers={"X-Device-Token": "intruder"}
        ).status_code
        == 403
    )

    found = client.post(
        f"/api/sightings/{sid}/found", headers={"X-Device-Token": "owner-001"}
    )
    assert found.status_code == 200
    assert found.json()["status"] == "found"
    assert found.json()["kind"] == "missing"

    # Off the public map.
    dots = client.get(
        "/api/sightings",
        params={"min_lat": -90, "max_lat": 90, "min_lng": -180, "max_lng": 180},
    ).json()
    assert dots == []

    # Still viewable by id (My sightings / deep link).
    detail = client.get(f"/api/sightings/{sid}")
    assert detail.status_code == 200
    assert detail.json()["status"] == "found"
    assert client.get(f"/api/sightings/{sid}/thumbnail").status_code == 200

    mine = client.get("/api/sightings/mine", headers={"X-Device-Token": "owner-001"}).json()
    assert len(mine) == 1
    assert mine[0]["id"] == sid
    assert mine[0]["status"] == "found"


def test_mark_found_rejects_regular_sighting(client):
    sid = create_sighting(client, "owner-001", kind="sighting").json()["id"]
    res = client.post(
        f"/api/sightings/{sid}/found", headers={"X-Device-Token": "owner-001"}
    )
    assert res.status_code == 400
