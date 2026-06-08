from tests.conftest import create_sighting


def test_health(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_create_and_get(client):
    r = create_sighting(client, "device-aaaaaaaa")
    assert r.status_code == 201
    body = r.json()
    assert body["photo_url"].endswith("/photo")

    detail = client.get(f"/api/sightings/{body['id']}")
    assert detail.status_code == 200
    assert detail.json()["description"] == "cat"


def test_missing_device_token(client, make_image):
    r = client.post(
        "/api/sightings",
        files={"image": ("cat.jpg", make_image(), "image/jpeg")},
        data={"lat": "1", "lng": "1"},
    )
    assert r.status_code == 400


def test_exif_gps_used_when_no_coords(client, make_image):
    r = client.post(
        "/api/sightings",
        headers={"X-Device-Token": "device-aaaaaaaa"},
        files={"image": ("gps.jpg", make_image(with_gps=True), "image/jpeg")},
        data={"description": "from exif"},
    )
    assert r.status_code == 201
    body = r.json()
    assert abs(body["lat"] - 48.8584) < 0.01
    assert abs(body["lng"] - 2.2945) < 0.01


def test_no_location_anywhere_rejected(client, make_image):
    r = client.post(
        "/api/sightings",
        headers={"X-Device-Token": "device-aaaaaaaa"},
        files={"image": ("nogps.jpg", make_image(), "image/jpeg")},
        data={"description": "nope"},
    )
    assert r.status_code == 400


def test_invalid_image_rejected(client):
    r = client.post(
        "/api/sightings",
        headers={"X-Device-Token": "device-aaaaaaaa"},
        files={"image": ("bad.jpg", b"not an image", "image/jpeg")},
        data={"lat": "1", "lng": "1"},
    )
    assert r.status_code == 400


def test_bbox_filtering(client):
    create_sighting(client, "device-aaaaaaaa", lat=40.0, lng=-3.0)
    create_sighting(client, "device-aaaaaaaa", lat=5.0, lng=5.0)

    all_dots = client.get(
        "/api/sightings",
        params={"min_lat": -90, "max_lat": 90, "min_lng": -180, "max_lng": 180},
    ).json()
    assert len(all_dots) == 2
    assert set(all_dots[0].keys()) == {"id", "lat", "lng", "confirmations_count"}

    near = client.get(
        "/api/sightings",
        params={"min_lat": 0, "max_lat": 10, "min_lng": 0, "max_lng": 10},
    ).json()
    assert len(near) == 1


def test_photo_and_thumbnail_served(client):
    sid = create_sighting(client, "device-aaaaaaaa").json()["id"]
    photo = client.get(f"/api/sightings/{sid}/photo")
    assert photo.status_code == 200
    assert photo.headers["content-type"] == "image/jpeg"
    thumb = client.get(f"/api/sightings/{sid}/thumbnail")
    assert thumb.status_code == 200


def test_confirm_flow(client):
    sid = create_sighting(client, "device-aaaaaaaa").json()["id"]

    r1 = client.post(f"/api/sightings/{sid}/confirm", headers={"X-Device-Token": "user-0001"})
    assert r1.json() == {"confirmations": 1, "already_confirmed": False}

    r2 = client.post(f"/api/sightings/{sid}/confirm", headers={"X-Device-Token": "user-0001"})
    assert r2.json() == {"confirmations": 1, "already_confirmed": True}

    r3 = client.post(f"/api/sightings/{sid}/confirm", headers={"X-Device-Token": "user-0002"})
    assert r3.json() == {"confirmations": 2, "already_confirmed": False}

    assert client.post(
        "/api/sightings/nope/confirm", headers={"X-Device-Token": "user-0001"}
    ).status_code == 404
