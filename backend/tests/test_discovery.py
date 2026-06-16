"""Feed (/recent) and My Sightings (/mine)."""

from tests.conftest import create_sighting


def _confirm(client, sid, token):
    client.post(f"/api/sightings/{sid}/confirm", headers={"X-Device-Token": token})


def test_recent_returns_newest_first_with_paging(client):
    ids = [create_sighting(client, "owner-001").json()["id"] for _ in range(3)]

    page1 = client.get("/api/sightings/recent", params={"limit": 2, "offset": 0}).json()
    assert [s["id"] for s in page1] == [ids[2], ids[1]]  # newest first

    page2 = client.get("/api/sightings/recent", params={"limit": 2, "offset": 2}).json()
    assert [s["id"] for s in page2] == [ids[0]]


def test_recent_sort_by_confirmed(client):
    a = create_sighting(client, "owner-001").json()["id"]
    b = create_sighting(client, "owner-001").json()["id"]
    _confirm(client, a, "watcher-01")
    _confirm(client, a, "watcher-02")
    _confirm(client, b, "watcher-03")

    top = client.get("/api/sightings/recent", params={"sort": "confirmed"}).json()
    assert top[0]["id"] == a
    assert top[0]["confirmations_count"] == 2


def test_recent_excludes_hidden(client):
    sid = create_sighting(client, "owner-001").json()["id"]
    for i in range(3):
        client.post(f"/api/sightings/{sid}/report", headers={"X-Device-Token": f"rep-000{i}"})
    rows = client.get("/api/sightings/recent").json()
    assert all(s["id"] != sid for s in rows)


def test_mine_filters_by_device_token(client):
    a = create_sighting(client, "owner-aaaa").json()["id"]
    create_sighting(client, "owner-bbbb")

    mine = client.get("/api/sightings/mine", headers={"X-Device-Token": "owner-aaaa"}).json()
    assert [s["id"] for s in mine] == [a]


def test_mine_requires_token(client):
    assert client.get("/api/sightings/mine").status_code == 400


def test_recent_and_mine_not_shadowed_by_id_route(client):
    """Ensure literal routes win over /{sighting_id}."""
    create_sighting(client, "owner-001")
    assert client.get("/api/sightings/recent").status_code == 200
    assert (
        client.get("/api/sightings/mine", headers={"X-Device-Token": "owner-001"}).status_code
        == 200
    )
