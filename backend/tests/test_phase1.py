"""Tests for Phase 1 backend foundations: multi-photo, attributes,
discovery filters/pagination, edit-own-sighting, and API versioning."""

from datetime import UTC, datetime, timedelta

from tests.conftest import create_sighting


def test_create_with_multiple_photos(client, make_image):
    r = client.post(
        "/api/sightings",
        headers={"X-Device-Token": "device-multi001"},
        files=[
            ("images", ("cat1.jpg", make_image(), "image/jpeg")),
            ("images", ("cat2.jpg", make_image(), "image/jpeg")),
        ],
        data={"lat": "10", "lng": "10", "description": "two cats"},
    )
    assert r.status_code == 201
    body = r.json()
    assert len(body["photos"]) == 2
    assert body["photos"][0]["id"] == "primary"

    extra = body["photos"][1]
    assert extra["photo_url"].endswith(f"/photos/{extra['id']}")
    assert extra["thumbnail_url"].endswith(f"/photos/{extra['id']}/thumbnail")

    photo = client.get(extra["photo_url"])
    assert photo.status_code == 200
    assert photo.headers["content-type"] == "image/jpeg"

    thumb = client.get(extra["thumbnail_url"])
    assert thumb.status_code == 200


def test_create_too_many_photos_rejected(client, make_image):
    files = [("images", (f"cat{i}.jpg", make_image(), "image/jpeg")) for i in range(7)]
    r = client.post(
        "/api/sightings",
        headers={"X-Device-Token": "device-multi002"},
        files=files,
        data={"lat": "10", "lng": "10"},
    )
    assert r.status_code == 400


def test_extra_photo_404_for_unknown_id(client):
    sid = create_sighting(client, "device-extra001").json()["id"]
    assert client.get(f"/api/sightings/{sid}/photos/does-not-exist").status_code == 404
    assert (
        client.get(f"/api/sightings/{sid}/photos/does-not-exist/thumbnail").status_code == 404
    )


def test_create_with_attributes(client):
    r = create_sighting(
        client,
        "device-attrs001",
        color="black",
        is_ear_tipped="true",
        is_stray="false",
    )
    assert r.status_code == 201
    body = r.json()
    assert body["color"] == "black"
    assert body["is_ear_tipped"] is True
    assert body["is_stray"] is False


def test_edit_own_sighting(client):
    sid = create_sighting(client, "device-edit001", description="old").json()["id"]

    forbidden = client.patch(
        f"/api/sightings/{sid}",
        headers={"X-Device-Token": "intruder"},
        data={"description": "hacked"},
    )
    assert forbidden.status_code == 403

    ok = client.patch(
        f"/api/sightings/{sid}",
        headers={"X-Device-Token": "device-edit001"},
        data={"description": "new desc", "color": "tabby", "is_ear_tipped": "true"},
    )
    assert ok.status_code == 200
    body = ok.json()
    assert body["description"] == "new desc"
    assert body["color"] == "tabby"
    assert body["is_ear_tipped"] is True

    assert client.patch(
        "/api/sightings/does-not-exist",
        headers={"X-Device-Token": "device-edit001"},
        data={"description": "nope"},
    ).status_code == 404


def test_list_filter_by_attributes(client):
    create_sighting(
        client,
        "device-filt001",
        lat=1.0,
        lng=1.0,
        color="black",
        is_ear_tipped="true",
        is_stray="true",
    )
    create_sighting(
        client,
        "device-filt002",
        lat=1.0,
        lng=1.0,
        color="white",
        is_ear_tipped="false",
        is_stray="false",
    )

    bbox = {"min_lat": -90, "max_lat": 90, "min_lng": -180, "max_lng": 180}

    black = client.get("/api/sightings", params={**bbox, "color": "black"}).json()
    assert len(black) == 1

    ear_tipped = client.get(
        "/api/sightings", params={**bbox, "is_ear_tipped": "true"}
    ).json()
    assert len(ear_tipped) == 1

    not_stray = client.get(
        "/api/sightings", params={**bbox, "is_stray": "false"}
    ).json()
    assert len(not_stray) == 1


def test_list_filter_by_min_confidence(client):
    import app.database as db
    from app.models import Sighting

    sid_high = create_sighting(client, "device-conf-high", lat=5.0, lng=5.0).json()["id"]
    sid_low = create_sighting(client, "device-conf-low", lat=5.0, lng=5.0).json()["id"]

    with db.SessionLocal() as session:
        session.get(Sighting, sid_high).cat_confidence = 0.9
        session.get(Sighting, sid_low).cat_confidence = 0.1
        session.commit()

    bbox = {"min_lat": -90, "max_lat": 90, "min_lng": -180, "max_lng": 180}
    confident = client.get("/api/sightings", params={**bbox, "min_confidence": 0.5}).json()
    ids = {s["id"] for s in confident}
    assert sid_high in ids
    assert sid_low not in ids


def test_list_pagination(client):
    for i in range(3):
        create_sighting(client, f"device-page00{i}", lat=2.0, lng=2.0)

    bbox = {"min_lat": -90, "max_lat": 90, "min_lng": -180, "max_lng": 180}

    page1 = client.get("/api/sightings", params={**bbox, "limit": 1, "offset": 0}).json()
    page2 = client.get("/api/sightings", params={**bbox, "limit": 1, "offset": 1}).json()
    assert len(page1) == 1
    assert len(page2) == 1
    assert page1[0]["id"] != page2[0]["id"]

    assert client.get("/api/sightings", params={**bbox, "limit": 0}).status_code == 400
    assert client.get("/api/sightings", params={**bbox, "offset": -1}).status_code == 400


def test_list_date_filters(client):
    create_sighting(client, "device-date001", lat=3.0, lng=3.0)

    bbox = {"min_lat": -90, "max_lat": 90, "min_lng": -180, "max_lng": 180}
    future = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    past = (datetime.now(UTC) - timedelta(days=1)).isoformat()

    none_yet = client.get("/api/sightings", params={**bbox, "since": future}).json()
    assert none_yet == []

    some = client.get("/api/sightings", params={**bbox, "since": past}).json()
    assert len(some) >= 1

    none_before = client.get("/api/sightings", params={**bbox, "until": past}).json()
    assert none_before == []


def test_admin_reports_pagination_and_sort(client):
    for i in range(3):
        sid = create_sighting(client, f"device-rep00{i}", lat=4.0, lng=4.0).json()["id"]
        client.post(f"/api/sightings/{sid}/report", headers={"X-Device-Token": f"reporter-{i}"})

    admin = {"X-Admin-Token": "test-admin"}

    page = client.get("/api/admin/reports", headers=admin, params={"limit": 2, "offset": 0})
    assert page.status_code == 200
    assert len(page.json()) == 2

    by_date = client.get("/api/admin/reports", headers=admin, params={"sort": "date"})
    assert by_date.status_code == 200

    assert client.get("/api/admin/reports", headers=admin, params={"sort": "bogus"}).status_code == 400
    assert client.get("/api/admin/reports", headers=admin, params={"limit": 0}).status_code == 400
    assert client.get("/api/admin/reports", headers=admin, params={"offset": -1}).status_code == 400


def test_api_v1_alias(client):
    sid = create_sighting(client, "device-v1alias", lat=6.0, lng=6.0).json()["id"]

    assert client.get(f"/api/v1/sightings/{sid}").status_code == 200
    assert client.get("/api/v1/stats").status_code == 200

    bbox = {"min_lat": -90, "max_lat": 90, "min_lng": -180, "max_lng": 180}
    v1_dots = client.get("/api/v1/sightings", params=bbox).json()
    legacy_dots = client.get("/api/sightings", params=bbox).json()
    assert v1_dots == legacy_dots
