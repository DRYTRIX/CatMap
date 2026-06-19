"""Adding photos to an existing sighting (community contributions).

Cat detection is disabled in the test environment (see conftest), so uploads
succeed without a real cat image.
"""

from tests.conftest import _make_image, create_sighting


def _img(name="extra.jpg"):
    return ("images", (name, _make_image(), "image/jpeg"))


def test_add_photos_appends_to_sighting(client):
    sid = create_sighting(client, "owner-001").json()["id"]

    res = client.post(
        f"/api/sightings/{sid}/photos",
        headers={"X-Device-Token": "owner-001"},
        files=[_img("a.jpg"), _img("b.jpg")],
    )
    assert res.status_code == 200
    body = res.json()
    # 1 primary + 2 added.
    assert len(body["photos"]) == 3
    assert [p["position"] for p in body["photos"]] == [0, 1, 2]

    # The newly added photo bytes are actually served.
    new_photo = body["photos"][-1]
    assert client.get(new_photo["photo_url"]).status_code == 200
    assert client.get(new_photo["thumbnail_url"]).status_code == 200


def test_any_device_can_add_photos(client):
    """Community path: a different device than the creator may add photos."""
    sid = create_sighting(client, "owner-001").json()["id"]

    res = client.post(
        f"/api/sightings/{sid}/photos",
        headers={"X-Device-Token": "passerby-002"},
        files=[_img()],
    )
    assert res.status_code == 200
    assert len(res.json()["photos"]) == 2


def test_add_photos_enforces_max(client):
    sid = create_sighting(client, "owner-001").json()["id"]

    # 1 primary + 5 = 6 (the max).
    fill = client.post(
        f"/api/sightings/{sid}/photos",
        headers={"X-Device-Token": "owner-001"},
        files=[_img() for _ in range(5)],
    )
    assert fill.status_code == 200
    assert len(fill.json()["photos"]) == 6

    # One more is rejected.
    over = client.post(
        f"/api/sightings/{sid}/photos",
        headers={"X-Device-Token": "owner-001"},
        files=[_img()],
    )
    assert over.status_code == 400


def test_add_more_than_remaining_rejected(client):
    sid = create_sighting(client, "owner-001").json()["id"]
    # Only 5 slots remain; asking to add 6 at once fails.
    res = client.post(
        f"/api/sightings/{sid}/photos",
        headers={"X-Device-Token": "owner-001"},
        files=[_img() for _ in range(6)],
    )
    assert res.status_code == 400


def test_add_photos_missing_sighting(client):
    res = client.post(
        "/api/sightings/does-not-exist/photos",
        headers={"X-Device-Token": "owner-001"},
        files=[_img()],
    )
    assert res.status_code == 404


def test_add_photos_requires_token(client):
    sid = create_sighting(client, "owner-001").json()["id"]
    res = client.post(f"/api/sightings/{sid}/photos", files=[_img()])
    assert res.status_code == 400
