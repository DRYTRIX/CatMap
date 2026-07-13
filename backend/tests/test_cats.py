"""Cat profiles: create, link, similar sightings, and admin delete."""

from tests.conftest import create_sighting

TOKEN = "owner-cats"


def test_create_cat_profile_from_sightings(client):
    s1 = create_sighting(client, TOKEN, description="orange tabby").json()
    s2 = create_sighting(client, TOKEN, lat=40.001, lng=-3.001, description="same cat").json()

    res = client.post(
        "/api/cats",
        headers={"X-Device-Token": TOKEN},
        data={"sighting_ids": f"{s1['id']},{s2['id']}", "name": "Ginger"},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["name"] == "Ginger"
    assert body["sighting_count"] == 2
    assert len(body["sightings"]) == 2

    detail = client.get(f"/api/sightings/{s1['id']}").json()
    assert detail["cat_id"] == body["id"]


def test_get_cat_profile(client):
    sid = create_sighting(client, TOKEN).json()["id"]
    cat_id = client.post(
        "/api/cats",
        headers={"X-Device-Token": TOKEN},
        data={"sighting_ids": sid},
    ).json()["id"]

    profile = client.get(f"/api/cats/{cat_id}")
    assert profile.status_code == 200
    assert profile.json()["sighting_count"] == 1


def test_link_and_unlink_sighting(client):
    s1 = create_sighting(client, TOKEN).json()
    s2 = create_sighting(client, TOKEN, lat=40.002, lng=-3.002).json()
    cat_id = client.post(
        "/api/cats",
        headers={"X-Device-Token": TOKEN},
        data={"sighting_ids": s1["id"]},
    ).json()["id"]

    link = client.post(
        f"/api/cats/{cat_id}/link",
        headers={"X-Device-Token": TOKEN},
        data={"sighting_id": s2["id"]},
    )
    assert link.status_code == 200
    assert link.json()["sighting_count"] == 2

    unlink = client.post(
        f"/api/cats/{cat_id}/unlink",
        headers={"X-Device-Token": TOKEN},
        data={"sighting_id": s2["id"]},
    )
    assert unlink.status_code == 200
    assert unlink.json()["sighting_count"] == 1


def test_similar_sightings_nearby(client):
    base = create_sighting(client, TOKEN, lat=50.0, lng=4.0, color="orange").json()
    nearby = create_sighting(
        client, "other-device", lat=50.0001, lng=4.0001, color="orange"
    ).json()
    far = create_sighting(client, "far-away", lat=51.0, lng=5.0, color="orange").json()

    similar = client.get(f"/api/sightings/{base['id']}/similar")
    assert similar.status_code == 200
    ids = {s["id"] for s in similar.json()}
    assert nearby["id"] in ids
    assert far["id"] not in ids
    assert base["id"] not in ids


def test_admin_delete_cat(client):
    sid = create_sighting(client, TOKEN).json()["id"]
    cat_id = client.post(
        "/api/cats",
        headers={"X-Device-Token": TOKEN},
        data={"sighting_ids": sid},
    ).json()["id"]

    res = client.delete(f"/api/admin/cats/{cat_id}", headers={"X-Admin-Token": "test-admin"})
    assert res.status_code == 204
    assert client.get(f"/api/cats/{cat_id}").status_code == 404
    assert client.get(f"/api/sightings/{sid}").json()["cat_id"] is None
