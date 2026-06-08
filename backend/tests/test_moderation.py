from tests.conftest import create_sighting

ADMIN = {"X-Admin-Token": "test-admin"}


def test_report_auto_hides_at_threshold(client):
    sid = create_sighting(client, "owner-001").json()["id"]

    # Default AUTO_HIDE_THRESHOLD is 3 distinct reports.
    r1 = client.post(f"/api/sightings/{sid}/report", headers={"X-Device-Token": "rep-0001"})
    assert r1.json() == {"reported": True, "hidden": False}
    client.post(f"/api/sightings/{sid}/report", headers={"X-Device-Token": "rep-0002"})
    r3 = client.post(f"/api/sightings/{sid}/report", headers={"X-Device-Token": "rep-0003"})
    assert r3.json()["hidden"] is True

    # Hidden sightings disappear from public list + detail.
    assert client.get(f"/api/sightings/{sid}").status_code == 404
    dots = client.get(
        "/api/sightings",
        params={"min_lat": -90, "max_lat": 90, "min_lng": -180, "max_lng": 180},
    ).json()
    assert dots == []


def test_report_idempotent_per_device(client):
    sid = create_sighting(client, "owner-001").json()["id"]
    first = client.post(f"/api/sightings/{sid}/report", headers={"X-Device-Token": "rep-0001"})
    second = client.post(f"/api/sightings/{sid}/report", headers={"X-Device-Token": "rep-0001"})
    assert first.json()["reported"] is True
    assert second.json()["reported"] is False


def test_delete_requires_creator(client):
    sid = create_sighting(client, "owner-001").json()["id"]

    forbidden = client.request(
        "DELETE", f"/api/sightings/{sid}", headers={"X-Device-Token": "intruder-1"}
    )
    assert forbidden.status_code == 403

    ok = client.request(
        "DELETE", f"/api/sightings/{sid}", headers={"X-Device-Token": "owner-001"}
    )
    assert ok.status_code == 204
    assert client.get(f"/api/sightings/{sid}").status_code == 404


def test_admin_requires_token(client):
    create_sighting(client, "owner-001")
    assert client.get("/api/admin/reports").status_code == 401
    assert client.get(
        "/api/admin/reports", headers={"X-Admin-Token": "wrong"}
    ).status_code == 401


def test_admin_can_list_and_hide(client):
    sid = create_sighting(client, "owner-001").json()["id"]
    client.post(f"/api/sightings/{sid}/report", headers={"X-Device-Token": "rep-0001"})

    reports = client.get("/api/admin/reports", headers=ADMIN)
    assert reports.status_code == 200
    assert reports.json()[0]["id"] == sid

    hide = client.post(f"/api/admin/sightings/{sid}/hide", headers=ADMIN)
    assert hide.json()["status"] == "hidden"
    assert client.get(f"/api/sightings/{sid}").status_code == 404

    unhide = client.post(f"/api/admin/sightings/{sid}/unhide", headers=ADMIN)
    assert unhide.json()["status"] == "active"
    assert client.get(f"/api/sightings/{sid}").status_code == 200
